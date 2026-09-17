#!/usr/bin/env python3
"""
Pulls your collection and wants from the Encora API and writes them as
collection.csv / wants.csv in the exact column layout the site expects
(see README.md > "CSV columns").

Run manually:
    ENCORA_API_KEY=xxxx python3 scripts/sync_encora.py

In CI, ENCORA_API_KEY comes from a GitHub Actions secret (see
.github/workflows/sync-encora.yml).

------------------------------------------------------------------------
STATUS
Both mappings are confirmed against real API responses.

Collection: /api/collection is Laravel-style paginated (current_page /
last_page / data), so it's walked with fetch_all_pages().

Wants: /api/wants returns { recording: {...}, priority, priority_label }
per item, wrapping the exact same nested `recording` object as collection
(cast, date, nft, metadata, notes, master_notes, release_format all
present). It isn't documented as paginated, so it's fetched with a single
api_get() call and no per_page param.

priority / priority_label (0-5, or -1 for "Trade Requested") are not
written to wants.csv - the site has no Priority column and doesn't need
one.
------------------------------------------------------------------------
"""

import csv
import os
import sys
import time
import json
import urllib.request
import urllib.error
from urllib.parse import urlencode

BASE_URL = "https://encora.it"
API_KEY = os.environ.get("ENCORA_API_KEY")

SHARED_COLUMNS = [
    "Audio / Video", "Show", "Tour", "Date", "Matinée / Evening", "Master",
    "Cast", "Master Notes", "Trading Notes", "NFT Date", "NFT Forever",
    "Not For Sale", "Type", "Release Format", "Amount Recorded", "Venue",
    "City", "Link",
]

COLLECTION_ONLY_COLUMNS = [
    "Gifting Status", "Limited Trade Status", "Trader Format", "My Notes",
    "Collected",
]


# --------------------------------------------------------------------
# HTTP helpers
# --------------------------------------------------------------------

def api_get(path, params=None):
    """GET an Encora API endpoint with the bearer token, return parsed JSON."""
    url = f"{BASE_URL}{path}"
    if params:
        url = f"{url}?{urlencode(params)}"

    request = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        # Without this, urllib's default User-Agent is the literal string
        # "Python-urllib/3.x", which Cloudflare's bot protection commonly
        # blocklists outright (error 1010 / browser_signature_banned),
        # independent of whether the API key is valid.
        "User-Agent": "PersephonesChildCollectionSync/1.0 (+https://github.com/)",
    })

    for attempt in range(2):
        try:
            with urllib.request.urlopen(request) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as error:
            if error.code == 429 and attempt == 0:
                retry_after = int(error.headers.get("Retry-After", "5"))
                print(f"Rate limited, waiting {retry_after}s...", file=sys.stderr)
                time.sleep(retry_after)
                continue
            raise RuntimeError(f"{path} returned HTTP {error.code}: {error.read().decode()}")
    raise RuntimeError(f"{path} failed after retry")


def fetch_all_pages(path, per_page=500):
    """
    Walks a Laravel-style paginated endpoint (current_page/last_page/data),
    which is the shape /api/collection actually returns. Stops once
    current_page reaches last_page.
    """
    records = []
    page = 1
    while True:
        body = api_get(path, {"per_page": per_page, "page": page})
        records.extend(body["data"])
        if body["current_page"] >= body["last_page"]:
            break
        page += 1
    return records


# --------------------------------------------------------------------
# Small shared helpers
# --------------------------------------------------------------------

def bool_to_csv(value):
    """The site's checks (e.g. `if (recording['NFT Forever'])`) just test
    truthiness, so blank = false, "TRUE" = true is enough."""
    return "TRUE" if value else ""


def format_cast(cast_list):
    """recording.cast is a list of {performer: {name}, character: {name}}.
    Joined as "Performer as Character; Performer as Character; ..."."""
    if not cast_list:
        return ""
    parts = []
    for entry in cast_list:
        performer_name = (entry.get("performer") or {}).get("name", "")
        character_name = (entry.get("character") or {}).get("name", "")
        if performer_name and character_name:
            parts.append(f"{performer_name} as {character_name}")
        elif performer_name:
            parts.append(performer_name)
    return "; ".join(parts)


def format_matinee_evening(time_value):
    return {"matinee": "Matinée", "evening": "Evening"}.get(time_value, "")


def format_audio_video(media_type):
    # metadata.media_type comes back lowercase ("video"/"audio"); the site
    # requires exactly "Audio" or "Video".
    return (media_type or "").capitalize()


def recording_link(recording_id):
    return f"https://encora.it/recordings/{recording_id}" if recording_id else ""


# --------------------------------------------------------------------
# Collection mapping - confirmed against a real API response.
# --------------------------------------------------------------------

def map_collection_record(item):
    recording = item["recording"]
    metadata = recording.get("metadata") or {}
    date = recording.get("date") or {}
    nft = recording.get("nft") or {}

    row = {
        "Audio / Video": format_audio_video(metadata.get("media_type")),
        "Show": recording.get("show", ""),
        "Tour": recording.get("tour", ""),
        "Date": (date.get("full_date") or ""),
        "Matinée / Evening": format_matinee_evening(date.get("time")),
        "Master": recording.get("master", ""),
        "Cast": format_cast(recording.get("cast")),
        "Master Notes": recording.get("master_notes") or "",
        "Trading Notes": recording.get("notes") or "",
        # nft_date arrives as a full timestamp; only the date is shown.
        "NFT Date": (nft.get("nft_date") or "")[:10],
        "NFT Forever": bool_to_csv(nft.get("nft_forever")),
        "Not For Sale": bool_to_csv(metadata.get("is_nfs")),
        "Type": metadata.get("recording_type", ""),
        "Release Format": recording.get("release_format") or "",
        "Amount Recorded": metadata.get("amount_recorded", ""),
        "Venue": metadata.get("venue", ""),
        "City": metadata.get("city", ""),
        "Link": recording_link(recording.get("id")),
        # Collection-only columns - these live on the wrapper, not `recording`,
        # since they're specific to your copy rather than the recording itself.
        "Gifting Status": metadata.get("gifting_status", ""),
        "Limited Trade Status": metadata.get("limited_status", ""),
        "Trader Format": item.get("format") or "",
        "My Notes": item.get("notes") or "",
        # collected_at comes back as a full timestamp
        # ("2026-09-16T23:59:49.000000Z"); only the date is used on the site,
        # so the time is dropped here to keep the CSV readable.
        "Collected": (item.get("collected_at") or "")[:10],
    }
    return row


# --------------------------------------------------------------------
# Wants mapping - confirmed against a real /api/wants response. Same
# nested `recording` shape as collection, wrapped as
# { recording: {...}, priority, priority_label } instead of the
# collection wrapper. priority / priority_label are intentionally not
# written out - no Priority column on the site. No collection-only
# fields apply here either (no format/notes/collected_at on a want).
# --------------------------------------------------------------------

def map_want_record(item):
    recording = item["recording"]
    metadata = recording.get("metadata") or {}
    date = recording.get("date") or {}
    nft = recording.get("nft") or {}

    return {
        "Audio / Video": format_audio_video(metadata.get("media_type")),
        "Show": recording.get("show", ""),
        "Tour": recording.get("tour", ""),
        "Date": (date.get("full_date") or ""),
        "Matinée / Evening": format_matinee_evening(date.get("time")),
        "Master": recording.get("master", ""),
        "Cast": format_cast(recording.get("cast")),
        "Master Notes": recording.get("master_notes") or "",
        "Trading Notes": recording.get("notes") or "",
        # nft_date arrives as a full timestamp; only the date is shown.
        "NFT Date": (nft.get("nft_date") or "")[:10],
        "NFT Forever": bool_to_csv(nft.get("nft_forever")),
        "Not For Sale": bool_to_csv(metadata.get("is_nfs")),
        "Type": metadata.get("recording_type", ""),
        "Release Format": recording.get("release_format") or "",
        "Amount Recorded": metadata.get("amount_recorded", ""),
        "Venue": metadata.get("venue", ""),
        "City": metadata.get("city", ""),
        "Link": recording_link(recording.get("id")),
    }


def write_csv(path, columns, rows):
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} rows to {path}")


def main():
    if not API_KEY:
        print("ENCORA_API_KEY is not set.", file=sys.stderr)
        sys.exit(1)

    collection_raw = fetch_all_pages("/api/collection")
    collection_rows = [map_collection_record(item) for item in collection_raw]
    write_csv("collection.csv", SHARED_COLUMNS + COLLECTION_ONLY_COLUMNS, collection_rows)

    wants_body = api_get("/api/wants")
    wants_raw = wants_body["data"] if isinstance(wants_body, dict) and "data" in wants_body else wants_body
    wants_rows = [map_want_record(item) for item in wants_raw]
    write_csv("wants.csv", SHARED_COLUMNS, wants_rows)


if __name__ == "__main__":
    main()
