import argparse
import io
import os
import concurrent.futures

import imagehash
import rawpy
from PIL import Image, ImageOps

HASH_SIZE = 32
MIN_HASH_SIMILARITY = 0.98

def get_jpg_hash(jpg_path):
    with Image.open(jpg_path) as jpg_file:
        jpg_image = ImageOps.exif_transpose(jpg_file).copy()
    return imagehash.phash(jpg_image, hash_size=HASH_SIZE)

def get_nef_hash(nef_path):
    with rawpy.imread(nef_path) as raw_file:
        thumbnail = raw_file.extract_thumb()

    if thumbnail.format == rawpy.ThumbFormat.JPEG:
        with Image.open(io.BytesIO(thumbnail.data)) as preview_file:
            nef_image = ImageOps.exif_transpose(preview_file).copy()
    elif thumbnail.format == rawpy.ThumbFormat.BITMAP:
        nef_image = Image.fromarray(thumbnail.data)
    else:
        raise ValueError(f"Unsupported NEF preview format: {thumbnail.format}")

    return imagehash.phash(nef_image, hash_size=HASH_SIZE)

def compare_hashes(jpg_hash, nef_hash):
    return 1 - (jpg_hash - nef_hash) / jpg_hash.hash.size

def process_jpg_file(jpg_path, nef_paths, verbose):
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
            nef_hash = get_nef_hash(nef_path)
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

def delete_jpgs_with_nef_pairs(directory, verbose=False):
    deleted_count = 0
    tasks = []

    with concurrent.futures.ProcessPoolExecutor() as executor:
        for root, _, files in os.walk(directory):
            nef_paths_by_prefix = {}
            for filename in files:
                stem, extension = os.path.splitext(filename)
                if extension.casefold() == ".nef" and len(stem) > 9:
                    prefix = stem[:-9].casefold()
                    nef_paths_by_prefix.setdefault(prefix, []).append(
                        os.path.join(root, filename)
                    )

            for filename in files:
                stem, extension = os.path.splitext(filename)
                if extension.casefold() != ".jpg" or len(stem) <= 9:
                    continue

                jpg_path = os.path.join(root, filename)
                nef_paths = nef_paths_by_prefix.get(stem[:-9].casefold(), [])
                if not nef_paths:
                    continue

                tasks.append(executor.submit(process_jpg_file, jpg_path, nef_paths, verbose))

        for future in concurrent.futures.as_completed(tasks):
            msg, deleted = future.result()
            if msg:
                print(msg)
            if deleted:
                deleted_count += 1

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
    args = parser.parse_args()

    if not os.path.isdir(args.folder):
        parser.error(f"not a folder: {args.folder}")

    deleted_count = delete_jpgs_with_nef_pairs(args.folder, verbose=args.verbose)
    print(
        f"Deleted {deleted_count} .jpg file(s) with at least "
        f"{MIN_HASH_SIMILARITY:.0%} perceptual-hash similarity."
    )

if __name__ == "__main__":
    main()
