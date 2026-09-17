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
IMPORTANT - this needs one more step before it will work:
The Encora API docs (https://encora.it/api-docs) don't publish the exact
field names in the JSON response bodies, only the endpoints. The FIELD
MAP dicts below are my best guess based on the site's own terminology
(Show, Tour, Master, NFT Date, etc.) and will need correcting once you
can see a real response.

To finish the setup:
  1. Request API access, get your key.
  2. Run:  curl -H "Authorization: Bearer YOUR_KEY" https://encora.it/api/collection?per_page=1
     and:  curl -H "Authorization: Bearer YOUR_KEY" https://encora.it/api/wants
  3. Paste one sample record from each into the chat and the two FIELD_MAP
     dicts below will be corrected to match exactly.
------------------------------------------------------------------------
"""

import csv
import os
import sys
import time
import urllib.request
import urllib.error
import json

BASE_URL = "https://encora.it"
API_KEY = os.environ.get("ENCORA_API_KEY")

# Columns used by both collection.csv and wants.csv, in the order the site
# expects (see README.md > "CSV columns").
SHARED_COLUMNS = [
    "Audio / Video", "Show", "Tour", "Date", "Matinée / Evening", "Master",
    "Cast", "Master Notes", "Trading Notes", "NFT Date", "NFT Forever",
    "Not For Sale", "Type", "Release Format", "Amount Recorded", "Venue",
    "City", "Link",
]

# Extra columns collection.csv has that wants.csv doesn't.
COLLECTION_ONLY_COLUMNS = [
    "Gifting Status", "Limited Trade Status", "Trader Format", "My Notes",
    "Collected",
]

# --------------------------------------------------------------------
# FIELD MAPS - TODO: verify against a real API response, see notice above.
# Each entry is: our CSV column name -> key(s) in the Encora JSON record.
# A tuple means "try these keys in order, use the first that exists" -
# useful while we're not sure which naming the API actually uses.
# --------------------------------------------------------------------
COMMON_FIELD_MAP = {
    "Audio / Video": ("audio_video", "type", "media_type"),
    "Show": ("show", "show_name", "title"),
    "Tour": ("tour",),
    "Date": ("date", "performance_date"),
    "Matinée / Evening": ("matinee_evening", "performance"),
    "Master": ("master", "master_name"),
    "Cast": ("cast",),
    "Master Notes": ("master_notes",),
    "Trading Notes": ("trading_notes", "notes"),
    "NFT Date": ("nft_date",),
    "NFT Forever": ("nft_forever",),
    "Not For Sale": ("not_for_sale",),
    "Type": ("recording_type", "type"),
    "Release Format": ("release_format", "format"),
    "Amount Recorded": ("amount_recorded", "amount"),
    "Venue": ("venue",),
    "City": ("city",),
    "Link": ("link", "url"),
}

COLLECTION_FIELD_MAP = {
    "Gifting Status": ("gifting_status",),
    "Limited Trade Status": ("limited_trade_status", "trade_status"),
    "Trader Format": ("trader_format", "format"),
    "My Notes": ("my_notes", "collection_notes"),
    "Collected": ("collected_at", "collected"),
}


def api_get(path, params=None):
    """GET an Encora API endpoint with the bearer token, return parsed JSON."""
    url = f"{BASE_URL}{path}"
    if params:
        from urllib.parse import urlencode
        url = f"{url}?{urlencode(params)}"

    request = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    })

    # Encora returns rate-limit headers; back off and retry once if we hit them.
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
    Collects every record from a paginated endpoint. Handles the two shapes
    Laravel APIs commonly use (a bare list, or {"data": [...], ...}) and
    stops once a page comes back short or empty. Adjust if Encora's actual
    pagination shape (e.g. page tokens, "next" links) turns out different.
    """
    records = []
    page = 1
    while True:
        body = api_get(path, {"per_page": per_page, "page": page})
        page_records = body["data"] if isinstance(body, dict) and "data" in body else body
        if not page_records:
            break
        records.extend(page_records)
        if len(page_records) < per_page:
            break
        page += 1
    return records


def map_record(record, field_map):
    """Turns one Encora JSON record into a dict keyed by our CSV column names."""
    row = {}
    for column, candidate_keys in field_map.items():
        value = ""
        for key in candidate_keys:
            if key in record and record[key] not in (None, ""):
                value = record[key]
                break
        # Booleans from the API (e.g. NFT Forever) become blank/TRUE so the
        # site's truthy check (`if (recording['NFT Forever'])`) works either way.
        if isinstance(value, bool):
            value = "TRUE" if value else ""
        row[column] = value
    return row


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
    collection_rows = [
        {**map_record(r, COMMON_FIELD_MAP), **map_record(r, COLLECTION_FIELD_MAP)}
        for r in collection_raw
    ]
    write_csv("collection.csv", SHARED_COLUMNS + COLLECTION_ONLY_COLUMNS, collection_rows)

    wants_raw = api_get("/api/wants")
    wants_raw = wants_raw["data"] if isinstance(wants_raw, dict) and "data" in wants_raw else wants_raw
    wants_rows = [map_record(r, COMMON_FIELD_MAP) for r in wants_raw]
    write_csv("wants.csv", SHARED_COLUMNS, wants_rows)


if __name__ == "__main__":
    main()
