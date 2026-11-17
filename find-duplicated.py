import argparse
import errno
import io
import os
import shutil
import time
import concurrent.futures

import imagehash
import rawpy
from PIL import Image, ImageOps

# 🛡️ Sentinel: Explicitly bound maximum image pixels (~100MP) and file size (150MB) to prevent Decompression Bomb / OOM DoS attacks
Image.MAX_IMAGE_PIXELS = 100_000_000
MAX_FILE_BYTES = 150 * 1024 * 1024

HASH_SIZE = 32
MIN_HASH_SIMILARITY = 0.98

def format_bytes(num_bytes):
    size = float(num_bytes)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if size < 1024.0 or unit == "TB":
            return f"{size:.0f} {unit}" if unit == "B" else f"{size:.2f} {unit}"
        size /= 1024.0

def get_jpg_hash(jpg_path, file_size=None):
    if _is_reparse_point(jpg_path):
        raise OSError(f"Refusing to read symlink or junction: {jpg_path}")
    if file_size is None:
        file_size = os.path.getsize(jpg_path)
    if file_size > MAX_FILE_BYTES:
        raise ValueError(f"JPG file size exceeds {MAX_FILE_BYTES} bytes")
    with Image.open(jpg_path) as jpg_file:
        # ⚡ Bolt: Use libjpeg DCT downscaling + grayscale draft mode before EXIF transpose (phash resizes to 128x128)
        jpg_file.draft("L", (256, 256))
        jpg_image = ImageOps.exif_transpose(jpg_file)
    return imagehash.phash(jpg_image, hash_size=HASH_SIZE)

def get_nef_hash(nef_path, file_size=None):
    if _is_reparse_point(nef_path):
        raise OSError(f"Refusing to read symlink or junction: {nef_path}")
    if file_size is None:
        file_size = os.path.getsize(nef_path)
    if file_size > MAX_FILE_BYTES:
        raise ValueError(f"NEF file size exceeds {MAX_FILE_BYTES} bytes")
    with rawpy.imread(nef_path) as raw_file:
        thumbnail = raw_file.extract_thumb()

    thumb_bytes = thumbnail.data.nbytes if hasattr(thumbnail.data, "nbytes") else len(thumbnail.data)
    if thumb_bytes > MAX_FILE_BYTES:
        raise ValueError("NEF thumbnail data exceeds maximum allowed bytes")

    if thumbnail.format == rawpy.ThumbFormat.JPEG:
        with Image.open(io.BytesIO(thumbnail.data)) as preview_file:
            # ⚡ Bolt: Downscale full-res embedded NEF JPEG previews during decode
            preview_file.draft("L", (256, 256))
            nef_image = ImageOps.exif_transpose(preview_file)
    elif thumbnail.format == rawpy.ThumbFormat.BITMAP:
        height, width = thumbnail.data.shape[:2]
        if width * height > Image.MAX_IMAGE_PIXELS:
            raise ValueError(
                f"NEF bitmap thumbnail dimensions ({width}x{height}) exceed "
                f"MAX_IMAGE_PIXELS ({Image.MAX_IMAGE_PIXELS})"
            )
        nef_image = Image.fromarray(thumbnail.data).convert("L")
        nef_image.thumbnail((256, 256), Image.Resampling.BILINEAR)
    else:
        raise ValueError(f"Unsupported NEF preview format: {thumbnail.format}")

    return imagehash.phash(nef_image, hash_size=HASH_SIZE)

def compare_hashes(jpg_hash, nef_hash):
    return 1 - (jpg_hash - nef_hash) / jpg_hash.hash.size

def _is_reparse_point(path):
    is_junction = getattr(os.path, "isjunction", lambda _p: False)
    return os.path.islink(path) or is_junction(path)

def _validate_no_reparse_lineage(path):
    curr = os.path.abspath(path)
    visited = set()
    while curr and curr not in visited:
        visited.add(curr)
        if os.path.lexists(curr) and _is_reparse_point(curr):
            return curr
        parent = os.path.dirname(curr)
        if parent == curr:
            break
        curr = parent
    return None

_VALIDATED_TARGET_DIRS = set()
MAX_COLLISION_ATTEMPTS = 10_000

def _quarantine_file(jpg_path, root_dir, quarantine_dir):
    if _is_reparse_point(jpg_path):
        raise OSError(f"Refusing to quarantine symlink or junction: {jpg_path}")
    rel_path = os.path.relpath(jpg_path, root_dir)
    if (
        rel_path == ".."
        or rel_path.startswith(".." + os.sep)
        or (os.altsep and rel_path.startswith(".." + os.altsep))
        or os.path.isabs(rel_path)
    ):
        rel_path = os.path.basename(jpg_path)
    dest_path = os.path.join(quarantine_dir, rel_path)
    target_dir = os.path.dirname(dest_path)
    # ⚡ Bolt: Memoize validated target directories to avoid repeating root-to-leaf reparse walks per file
    if target_dir not in _VALIDATED_TARGET_DIRS:
        reparse_target = _validate_no_reparse_lineage(target_dir)
        if reparse_target:
            raise OSError(f"Refusing to quarantine through symlink or junction: {reparse_target}")
        os.makedirs(target_dir, exist_ok=True)
        reparse_target = _validate_no_reparse_lineage(target_dir)
        if reparse_target:
            raise OSError(f"Refusing to quarantine through symlink or junction: {reparse_target}")
        _VALIDATED_TARGET_DIRS.add(target_dir)
    else:
        os.makedirs(target_dir, exist_ok=True)

    base, ext = os.path.splitext(dest_path)
    counter = 1
    candidate = dest_path
    while True:
        if counter > MAX_COLLISION_ATTEMPTS:
            raise OSError(f"Exceeded {MAX_COLLISION_ATTEMPTS} quarantine collision attempts for {dest_path}")
        if os.path.isdir(candidate):
            candidate = f"{base}_{counter}{ext}"
            counter += 1
            continue
        try:
            fd = os.open(candidate, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.close(fd)
            break
        except (FileExistsError, IsADirectoryError):
            candidate = f"{base}_{counter}{ext}"
            counter += 1
        except PermissionError:
            if os.path.lexists(candidate):
                candidate = f"{base}_{counter}{ext}"
                counter += 1
                continue
            raise

    try:
        if _is_reparse_point(candidate):
            raise OSError(f"Refusing to overwrite symlink or junction at destination: {candidate}")
        try:
            os.replace(jpg_path, candidate)
        except OSError as e:
            if getattr(e, "errno", None) == errno.EXDEV:
                shutil.copy2(jpg_path, candidate)
                os.remove(jpg_path)
            else:
                raise
    except Exception:
        try:
            if os.path.lexists(candidate) and not _is_reparse_point(candidate):
                os.remove(candidate)
        except OSError:
            pass
        raise
    return candidate

def process_jpg_file(
    jpg_path,
    nef_paths,
    verbose,
    nef_hash_cache=None,
    dry_run=False,
    delete=False,
    root_dir=None,
    quarantine_dir=None,
):
    best_similarity = None

    # ⚡ Bolt: Cache the JPG hash to avoid recalculating it for every NEF file
    # This turns O(N) expensive image loads/hashes into O(1) for the JPG
    try:
        jpg_size = os.path.getsize(jpg_path)
        jpg_hash = get_jpg_hash(jpg_path, file_size=jpg_size)
    except Exception as error:
        if verbose:
            print(f"Could not load/hash JPG {jpg_path}: {error}")
        return None, False, 0

    for nef_path in nef_paths:
        try:
            if nef_hash_cache is not None and nef_path in nef_hash_cache:
                nef_hash = nef_hash_cache[nef_path]
            else:
                nef_hash = get_nef_hash(nef_path)
                if nef_hash_cache is not None:
                    nef_hash_cache[nef_path] = nef_hash
            similarity = compare_hashes(jpg_hash, nef_hash)
        except Exception as error:
            if verbose:
                print(f"Could not validate {jpg_path} against {nef_path}: {error}")
            continue

        if best_similarity is None or similarity > best_similarity:
            best_similarity = similarity
        if similarity >= MIN_HASH_SIMILARITY:
            break

    if best_similarity is not None and best_similarity >= MIN_HASH_SIMILARITY:
        if dry_run:
            verb = "delete" if delete else "quarantine"
            return f"[DRY-RUN] Would {verb}: {jpg_path} (perceptual hash similarity: {best_similarity:.2%})", True, jpg_size
        try:
            if _is_reparse_point(jpg_path):
                raise OSError(f"Refusing to modify symlink or junction: {jpg_path}")
            if delete:
                os.remove(jpg_path)
                action_msg = f"Deleted: {jpg_path}"
            else:
                dest_path = _quarantine_file(jpg_path, root_dir, quarantine_dir)
                action_msg = f"Quarantined: {jpg_path} -> {dest_path}"
        except OSError as e:
            # Always return the error to be logged (even if not verbose,
            # errors during deletion/quarantine are important)
            verb = "delete" if delete else "quarantine"
            return f"Error: Failed to {verb} {jpg_path}: {e}", False, 0

        if verbose:
            return f"{action_msg} (perceptual hash similarity: {best_similarity:.2%})", True, jpg_size
        return None, True, jpg_size
    elif verbose:
        if best_similarity is None:
            reason = "could not calculate a perceptual hash"
        else:
            reason = f"best perceptual hash similarity: {best_similarity:.2%}"
        return f"Kept: {jpg_path} ({reason})", False, 0

    return None, False, 0

def process_prefix_group(jpg_paths, nef_paths, verbose, dry_run=False, delete=False, root_dir=None, quarantine_dir=None):
    # ⚡ Bolt: Cache NEF hashes across JPGs sharing the same prefix in a directory
    nef_hash_cache = {} if len(jpg_paths) > 1 else None
    results = []
    for jpg_path in jpg_paths:
        results.append(
            process_jpg_file(
                jpg_path,
                nef_paths,
                verbose,
                nef_hash_cache=nef_hash_cache,
                dry_run=dry_run,
                delete=delete,
                root_dir=root_dir,
                quarantine_dir=quarantine_dir,
            )
        )
    return results

def process_prefix_batch(batch, verbose, dry_run=False, delete=False, root_dir=None, quarantine_dir=None):
    batch_results = []
    for group_jpgs, nef_paths in batch:
        batch_results.extend(
            process_prefix_group(
                group_jpgs,
                nef_paths,
                verbose,
                dry_run=dry_run,
                delete=delete,
                root_dir=root_dir,
                quarantine_dir=quarantine_dir,
            )
        )
    return batch_results

def delete_jpgs_with_nef_pairs(directory, verbose=False, dry_run=False, delete=False, quarantine_dir=None, return_stats=False):
    root_dir = os.path.abspath(directory)
    reparse_root = _validate_no_reparse_lineage(root_dir)
    if reparse_root:
        raise ValueError(f"Refusing to scan symlink or junction: {reparse_root}")

    if not delete:
        if quarantine_dir is None:
            quarantine_dir = os.path.join(root_dir, "_duplicates_quarantine")
        quarantine_dir_abs = os.path.abspath(quarantine_dir)
        reparse_quarantine = _validate_no_reparse_lineage(quarantine_dir_abs)
        if reparse_quarantine:
            raise ValueError(f"Quarantine directory must not be or traverse a symlink or junction: {reparse_quarantine}")
        root_norm_dir = os.path.normcase(root_dir).rstrip("\\/") + os.sep
        quarantine_norm_dir = os.path.normcase(quarantine_dir_abs).rstrip("\\/") + os.sep
        if quarantine_norm_dir == root_norm_dir or root_norm_dir.startswith(quarantine_norm_dir):
            raise ValueError(f"Quarantine directory cannot be or contain the scan root directory: {quarantine_dir_abs}")
        if os.path.lexists(quarantine_dir_abs) and not os.path.isdir(quarantine_dir_abs):
            raise ValueError(f"Quarantine path exists and is not a folder: {quarantine_dir_abs}")
    else:
        quarantine_dir_abs = None

    quarantine_dir_norm = os.path.normcase(quarantine_dir_abs) if quarantine_dir_abs else None

    deleted_count = 0
    reclaimed_bytes = 0
    scanned_dirs = 0
    total_nefs = 0
    total_jpgs = 0
    work_items = []

    stack = [root_dir]
    while stack:
        current_dir = stack.pop()
        try:
            with os.scandir(current_dir) as it:
                entries = list(it)
        except OSError:
            continue
        scanned_dirs += 1

        nef_paths_by_prefix = {}
        jpg_entries = []

        # ⚡ Bolt: Consolidated two iterations over `files` into a single pass via os.scandir.
        for entry in entries:
            is_junction = getattr(entry, "is_junction", lambda: False)
            if entry.is_symlink() or is_junction():
                continue

            if entry.is_dir():
                if quarantine_dir_norm and os.path.normcase(os.path.abspath(entry.path)) == quarantine_dir_norm:
                    continue
                stack.append(entry.path)
            elif entry.is_file():
                name = entry.name
                # ⚡ Bolt: Fast-path length check before os.path.splitext() and .casefold().
                if len(name) <= 13:
                    continue
                stem, extension = os.path.splitext(name)
                ext_lower = extension.casefold()

                if ext_lower == ".nef":
                    total_nefs += 1
                    prefix = stem[:-9].casefold()
                    nef_paths_by_prefix.setdefault(prefix, []).append(entry.path)
                elif ext_lower == ".jpg":
                    total_jpgs += 1
                    jpg_entries.append((entry.path, stem))

        # ⚡ Bolt: Skip JPG prefix computation entirely in folders with no NEF files
        if not nef_paths_by_prefix:
            continue

        jpgs_by_prefix = {}
        for jpg_path, stem in jpg_entries:
            prefix = stem[:-9].casefold()
            if prefix in nef_paths_by_prefix:
                jpgs_by_prefix.setdefault(prefix, []).append(jpg_path)

        for prefix, group_jpgs in jpgs_by_prefix.items():
            work_items.append((group_jpgs, nef_paths_by_prefix[prefix]))

    if not work_items:
        print(f"Scanned {scanned_dirs} folder(s) ({total_nefs} NEF(s), {total_jpgs} JPG(s)): no matching NEF/JPG prefix pairs found.")
        return (0, 0) if return_stats else 0

    total_candidate_jpgs = sum(len(group_jpgs) for group_jpgs, _ in work_items)
    print(f"Scanned {scanned_dirs} folder(s): found {total_candidate_jpgs} candidate JPG(s) across {len(work_items)} NEF prefix group(s).")

    # ⚡ Bolt: Avoid ProcessPoolExecutor spawn + heavy scientific import overhead (~0.45s/worker on Windows) for small workloads
    if len(work_items) < 16:
        total_groups = len(work_items)
        for idx, (group_jpgs, nef_paths) in enumerate(work_items, start=1):
            for msg, deleted, item_bytes in process_prefix_group(
                group_jpgs,
                nef_paths,
                verbose,
                dry_run=dry_run,
                delete=delete,
                root_dir=root_dir,
                quarantine_dir=quarantine_dir_abs,
            ):
                if msg:
                    print(msg)
                if deleted:
                    deleted_count += 1
                    reclaimed_bytes += item_bytes
            if total_groups >= 4 and (idx % 4 == 0 or idx == total_groups):
                print(f"Progress: {idx}/{total_groups} group(s) checked...")
        return (deleted_count, reclaimed_bytes) if return_stats else deleted_count

    # ⚡ Bolt: Dynamically scale batch size so medium workloads distribute across available CPU cores
    cpu_count = os.cpu_count() or 1
    batch_size = max(1, min(8, len(work_items) // (cpu_count * 2)))
    batches = [work_items[i:i + batch_size] for i in range(0, len(work_items), batch_size)]
    total_batches = len(batches)
    max_workers = min(cpu_count, total_batches)
    progress_step = 1 if total_batches < 10 else 10

    with concurrent.futures.ProcessPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(
                process_prefix_batch,
                batch,
                verbose,
                dry_run=dry_run,
                delete=delete,
                root_dir=root_dir,
                quarantine_dir=quarantine_dir_abs,
            )
            for batch in batches
        ]
        for completed, future in enumerate(concurrent.futures.as_completed(futures), start=1):
            try:
                for msg, deleted, item_bytes in future.result():
                    if msg:
                        print(msg)
                    if deleted:
                        deleted_count += 1
                        reclaimed_bytes += item_bytes
            except Exception as e:
                print(f"Error processing a file pair: {e}")
            if completed % progress_step == 0 or completed == total_batches:
                print(f"Progress: {completed}/{total_batches} batch(es) checked...")

    return (deleted_count, reclaimed_bytes) if return_stats else deleted_count

def main():
    parser = argparse.ArgumentParser(
        description=(
            "Quarantine (or delete with --delete --yes) JPG files paired with NEFs in the "
            "same folder when their perceptual hashes match by at least 98%, ignoring the "
            "last 9 filename-stem characters."
        )
    )
    parser.add_argument("folder", help="Folder to scan recursively")
    parser.add_argument(
        "-v", "--verbose", action="store_true", help="Show each processed JPG file"
    )
    parser.add_argument(
        "-n", "--dry-run", action="store_true", help="Preview matching JPGs without moving or deleting them"
    )
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument(
        "-q",
        "--quarantine",
        help="Move matching JPGs to this quarantine directory (default: <folder>/_duplicates_quarantine)",
    )
    mode_group.add_argument(
        "--delete",
        action="store_true",
        help="Permanently delete matching JPGs instead of quarantining (requires --yes)",
    )
    parser.add_argument(
        "-y",
        "--yes",
        action="store_true",
        help="Confirm permanent deletion when --delete is specified",
    )
    args = parser.parse_args()

    if not os.path.isdir(args.folder):
        parser.error(f"not a folder: {args.folder}")
    reparse_folder = _validate_no_reparse_lineage(args.folder)
    if reparse_folder:
        parser.error(f"refusing to scan symlink or junction: {reparse_folder}")

    if args.delete and not args.yes and not args.dry_run:
        parser.error("--delete requires --yes to permanently delete files without quarantine.")

    effective_quarantine = (
        args.quarantine
        if args.quarantine
        else (None if args.delete else os.path.join(os.path.abspath(args.folder), "_duplicates_quarantine"))
    )
    if effective_quarantine:
        effective_quarantine_abs = os.path.abspath(effective_quarantine)
        root_abs = os.path.abspath(args.folder)
        reparse_quarantine = _validate_no_reparse_lineage(effective_quarantine_abs)
        if reparse_quarantine:
            parser.error(f"quarantine directory must not be or traverse a symlink or junction: {reparse_quarantine}")
        root_norm_dir = os.path.normcase(root_abs).rstrip("\\/") + os.sep
        quarantine_norm_dir = os.path.normcase(effective_quarantine_abs).rstrip("\\/") + os.sep
        if quarantine_norm_dir == root_norm_dir or root_norm_dir.startswith(quarantine_norm_dir):
            parser.error(f"quarantine directory cannot be or contain the scan folder: {effective_quarantine_abs}")
        if os.path.lexists(effective_quarantine_abs) and not os.path.isdir(effective_quarantine_abs):
            parser.error(f"quarantine path exists and is not a folder: {effective_quarantine_abs}")

    try:
        if args.dry_run:
            print("Mode: DRY-RUN (preview only — no files will be modified)")
        elif args.delete:
            print("Mode: PERMANENT DELETE")
        else:
            print(f"Mode: QUARANTINE -> {os.path.abspath(effective_quarantine)}")
        start_time = time.monotonic()
        processed_count, reclaimed_bytes = delete_jpgs_with_nef_pairs(
            args.folder,
            verbose=args.verbose,
            dry_run=args.dry_run,
            delete=args.delete,
            quarantine_dir=args.quarantine,
            return_stats=True,
        )
        elapsed = time.monotonic() - start_time
        if args.dry_run:
            action_word = "Would delete" if args.delete else "Would quarantine"
        else:
            action_word = "Deleted" if args.delete else "Quarantined"
        print(
            f"{action_word} {processed_count} .jpg file(s) ({format_bytes(reclaimed_bytes)}) with at least "
            f"{MIN_HASH_SIMILARITY:.0%} perceptual-hash similarity ({elapsed:.2f}s)."
        )
        if not args.delete and processed_count > 0 and effective_quarantine:
            label = "Target quarantine folder" if args.dry_run else "Quarantine folder"
            print(f"{label}: {os.path.abspath(effective_quarantine)}")
        if args.dry_run and processed_count > 0:
            print("Tip: Re-run without --dry-run to apply these changes.")
    except KeyboardInterrupt:
        print("\nOperation cancelled by user.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    main()
