import argparse
import io
import os
import concurrent.futures

import imagehash
import rawpy
from PIL import Image, ImageOps

# 🛡️ Sentinel: Explicitly bound maximum image pixels (~100MP) to prevent Decompression Bomb DoS attacks
Image.MAX_IMAGE_PIXELS = 100_000_000

HASH_SIZE = 32
MIN_HASH_SIMILARITY = 0.98

def get_jpg_hash(jpg_path):
    with Image.open(jpg_path) as jpg_file:
        # ⚡ Bolt: Use libjpeg DCT downscaling + grayscale draft mode before EXIF transpose (phash resizes to 128x128)
        jpg_file.draft("L", (512, 512))
        jpg_image = ImageOps.exif_transpose(jpg_file)
    return imagehash.phash(jpg_image, hash_size=HASH_SIZE)

def get_nef_hash(nef_path):
    with rawpy.imread(nef_path) as raw_file:
        thumbnail = raw_file.extract_thumb()

    if thumbnail.format == rawpy.ThumbFormat.JPEG:
        with Image.open(io.BytesIO(thumbnail.data)) as preview_file:
            # ⚡ Bolt: Downscale full-res embedded NEF JPEG previews during decode
            preview_file.draft("L", (512, 512))
            nef_image = ImageOps.exif_transpose(preview_file)
    elif thumbnail.format == rawpy.ThumbFormat.BITMAP:
        nef_image = Image.fromarray(thumbnail.data)
    else:
        raise ValueError(f"Unsupported NEF preview format: {thumbnail.format}")

    return imagehash.phash(nef_image, hash_size=HASH_SIZE)

def compare_hashes(jpg_hash, nef_hash):
    return 1 - (jpg_hash - nef_hash) / jpg_hash.hash.size

def process_jpg_file(jpg_path, nef_paths, verbose, nef_hash_cache=None, dry_run=False):
    best_similarity = None

    # ⚡ Bolt: Cache the JPG hash to avoid recalculating it for every NEF file
    # This turns O(N) expensive image loads/hashes into O(1) for the JPG
    try:
        jpg_hash = get_jpg_hash(jpg_path)
    except Exception as error:
        if verbose:
            print(f"Could not load/hash JPG {jpg_path}: {error}")
        return None, False

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
            return f"[DRY-RUN] Would delete: {jpg_path} (perceptual hash similarity: {best_similarity:.2%})", True
        try:
            os.remove(jpg_path)
        except OSError as e:
            # Always return the error to be logged (even if not verbose,
            # errors during deletion are important)
            return f"Error: Failed to delete {jpg_path}: {e}", False

        if verbose:
            return f"Deleted: {jpg_path} (perceptual hash similarity: {best_similarity:.2%})", True
        return None, True
    elif verbose:
        if best_similarity is None:
            reason = "could not calculate a perceptual hash"
        else:
            reason = f"best perceptual hash similarity: {best_similarity:.2%}"
        return f"Kept: {jpg_path} ({reason})", False

    return None, False

def process_prefix_group(jpg_paths, nef_paths, verbose, dry_run=False):
    # ⚡ Bolt: Cache NEF hashes across JPGs sharing the same prefix in a directory
    nef_hash_cache = {} if len(jpg_paths) > 1 else None
    results = []
    for jpg_path in jpg_paths:
        results.append(process_jpg_file(jpg_path, nef_paths, verbose, nef_hash_cache=nef_hash_cache, dry_run=dry_run))
    return results

def delete_jpgs_with_nef_pairs(directory, verbose=False, dry_run=False):
    deleted_count = 0
    tasks = []

    with concurrent.futures.ProcessPoolExecutor() as executor:
        stack = [directory]
        while stack:
            current_dir = stack.pop()
            try:
                with os.scandir(current_dir) as it:
                    entries = list(it)
            except OSError:
                continue

            nef_paths_by_prefix = {}
            jpg_paths = []

            # ⚡ Bolt: Consolidated two iterations over `files` into a single pass.
            # This avoids redundant `os.path.islink` checks which cause slow `stat` system calls,
            # halving the I/O discovery overhead.
            # ⚡ Bolt: Replaced os.walk with os.scandir stack-based traversal to use entry.is_symlink()
            # and entry.is_dir()/is_file(), eliminating implicit `stat` overhead in os.walk and os.path.
            for entry in entries:
                if entry.is_symlink():
                    continue

                if entry.is_dir():
                    stack.append(entry.path)
                elif entry.is_file():
                    name = entry.name
                    # ⚡ Bolt: Fast-path length check before os.path.splitext() and .casefold().
                    # A valid stem > 9 chars plus a 4-char extension (.nef/.jpg) requires len > 13.
                    if len(name) <= 13:
                        continue
                    stem, extension = os.path.splitext(name)
                    ext_lower = extension.casefold()

                    if ext_lower == ".nef":
                        prefix = stem[:-9].casefold()
                        nef_paths_by_prefix.setdefault(prefix, []).append(entry.path)
                    elif ext_lower == ".jpg":
                        jpg_paths.append((entry.path, stem[:-9].casefold()))

            jpgs_by_prefix = {}
            for jpg_path, prefix in jpg_paths:
                if prefix in nef_paths_by_prefix:
                    jpgs_by_prefix.setdefault(prefix, []).append(jpg_path)

            for prefix, group_jpgs in jpgs_by_prefix.items():
                tasks.append(executor.submit(process_prefix_group, group_jpgs, nef_paths_by_prefix[prefix], verbose, dry_run))

        total_tasks = len(tasks)
        for completed, future in enumerate(concurrent.futures.as_completed(tasks), start=1):
            try:
                for msg, deleted in future.result():
                    if msg:
                        print(msg)
                    if deleted:
                        deleted_count += 1
            except Exception as e:
                print(f"Error processing a file pair: {e}")
            if total_tasks >= 10 and (completed % 25 == 0 or completed == total_tasks):
                print(f"Progress: {completed}/{total_tasks} prefix group(s) checked...")

    return deleted_count

def main():
    parser = argparse.ArgumentParser(
        description=(
            "Delete JPG files paired with NEFs in the same folder when their "
            "perceptual hashes match by at least 98%, ignoring the last 9 "
            "filename-stem characters."
        )
    )
    parser.add_argument("folder", help="Folder to scan recursively")
    parser.add_argument(
        "-v", "--verbose", action="store_true", help="Show each deleted JPG file"
    )
    parser.add_argument(
        "-n", "--dry-run", action="store_true", help="Preview matching JPGs without deleting them"
    )
    args = parser.parse_args()

    if not os.path.isdir(args.folder):
        parser.error(f"not a folder: {args.folder}")

    try:
        deleted_count = delete_jpgs_with_nef_pairs(args.folder, verbose=args.verbose, dry_run=args.dry_run)
        action_word = "Would delete" if args.dry_run else "Deleted"
        print(
            f"{action_word} {deleted_count} .jpg file(s) with at least "
            f"{MIN_HASH_SIMILARITY:.0%} perceptual-hash similarity."
        )
    except KeyboardInterrupt:
        print("\nOperation cancelled by user.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    main()
