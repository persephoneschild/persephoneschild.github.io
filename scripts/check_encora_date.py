#!/usr/bin/env python3
"""
One-off diagnostic script - NOT part of the site.

Prints the raw 'date' object (and a couple of neighboring fields) that
Encora's API returns for one specific recording, so we can see how it
flags an imprecise/unknown day.

Usage (Windows cmd):
    set ENCORA_API_KEY=your_key_here
    python check_encora_date.py

Usage (macOS/Linux):
    ENCORA_API_KEY=your_key_here python3 check_encora_date.py
"""

import os
import sys
import json
import urllib.request
import urllib.error
from urllib.parse import urlencode

BASE_URL = "https://encora.it"
API_KEY = os.environ.get("ENCORA_API_KEY")
TARGET_RECORDING_ID = 2026829  # Born With Teeth - West End - Jagweed


def api_get(path, params=None):
    url = f"{BASE_URL}{path}"
    if params:
        url = f"{url}?{urlencode(params)}"
    request = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "PersephonesChildCollectionSync/1.0 (+https://github.com/)",
    })
    with urllib.request.urlopen(request) as response:
        raw = response.read()
        print(f"--- DEBUG: HTTP {response.status}, {len(raw)} bytes, "
              f"content-type={response.headers.get('Content-Type')} ---", file=sys.stderr)
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            print("--- DEBUG: response was not valid JSON. First 1000 bytes: ---", file=sys.stderr)
            print(raw[:1000], file=sys.stderr)
            raise


def main():
    if not API_KEY:
        print("ENCORA_API_KEY is not set.", file=sys.stderr)
        sys.exit(1)

    page = 1
    while True:
        body = api_get("/api/collection", {"per_page": 500, "page": page})
        for item in body["data"]:
            recording = item["recording"]
            if recording.get("id") == TARGET_RECORDING_ID:
                print(f"Found recording {TARGET_RECORDING_ID} ({recording.get('show')}) on page {page}:\n")
                print("Full 'date' object:")
                print(json.dumps(recording.get("date"), indent=2))
                print("\nFull 'recording' object, for context (in case the precision flag lives elsewhere):")
                print(json.dumps(recording, indent=2))
                return
        if body["current_page"] >= body["last_page"]:
            break
        page += 1

    print(f"Recording {TARGET_RECORDING_ID} was not found in the collection.", file=sys.stderr)


if __name__ == "__main__":
    main()
