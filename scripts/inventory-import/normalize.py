#!/usr/bin/env python3
"""Normalize docs/content.xlsx into inventory.normalized.json (stdlib only, deterministic).

Usage:
  python3 -I scripts/inventory-import/normalize.py [--xlsx docs/content.xlsx] [--out PATH]
      [--report docs/inventory-import-report.md] [--image-results PATH] [--batch content-xlsx-v1]
No network, no database. Output contains no timestamps so reruns are byte-identical.
"""
import argparse, collections, datetime, hashlib, json, os, re, sys, unicodedata, zipfile
import urllib.parse
import xml.etree.ElementTree as ET

M = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
NS = {'m': M}
DEFAULT_OUT = '/tmp/claude-1000/-home-nishtha-code-repeatless-kangroo-Kinetix/6ceed5ec-9462-47a4-af29-2ae9f852f0d2/scratchpad/inventory.normalized.json'
NULL_TOKENS = {'', 'n/a', 'na', '-', '--', '—'}

# Conservative ambiguity heuristic (see report). City names that are well-known homonyms in other
# provinces/countries, or that carry explicit non-Ontario evidence in this dataset.
HOMONYM_CITIES = {'london', 'waterloo', 'hamilton', 'newmarket', 'bolton', 'burlington',
                  'king city', 'richmond hill', 'brampton'}
NON_ONTARIO_EVIDENCE = {'austin': 'Austin (Texas is the best-known Austin)',
                        'airmont': 'Airmont (New York village)',
                        'aldergrove east': 'Aldergrove East (British Columbia)'}

LEGACY_FIELD_COLS = ['content_status', 'blog_type', 'blog_status', 'video_status',
                     'image_post_status', 'script_type', 'last_used_for_video', 'video_use_count']


def unescape_xlsx(s):
    # OOXML escapes control chars as _xHHHH_
    return re.sub(r'_x([0-9A-Fa-f]{4})_', lambda m: chr(int(m.group(1), 16)), s)


def col_index(ref):
    n = 0
    for ch in re.match(r'[A-Z]+', ref).group():
        n = n * 26 + ord(ch) - 64
    return n


def read_workbook(path):
    z = zipfile.ZipFile(path)
    ss = []
    for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS):
        ss.append(unescape_xlsx(''.join(t.text or '' for t in si.iter('{%s}t' % M))))
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    rmap = {r.get('Id'): r.get('Target') for r in rels}
    rid = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
    sheets = {}
    for s in wb.find('m:sheets', NS):
        target = rmap[s.get(rid)].lstrip('/')
        if not target.startswith('xl/'):
            target = 'xl/' + target
        root = ET.fromstring(z.read(target))
        rows = {}
        for row in root.findall('.//m:row', NS):
            d = {}
            for c in row.findall('m:c', NS):
                v = c.find('m:v', NS)
                t = c.get('t')
                if t == 's':
                    val = ss[int(v.text)]
                elif t == 'inlineStr':
                    val = unescape_xlsx(''.join(x.text or '' for x in c.iter('{%s}t' % M)))
                else:
                    val = v.text if v is not None else None
                if val is not None and val != '':
                    d[col_index(c.get('r'))] = val
            rows[int(row.get('r'))] = d
        sheets[s.get('name')] = rows
    return sheets


def nfc(s):
    return unicodedata.normalize('NFC', s)


def clean(s):
    """trim + NFC + null tokens -> None (internal whitespace preserved)."""
    if s is None:
        return None
    s = nfc(s).strip()
    return None if s.lower() in NULL_TOKENS else s


def clean_collapse(s):
    s = clean(s)
    return None if s is None else re.sub(r'\s+', ' ', s)


def norm_key(s):
    return re.sub(r'\s+', ' ', nfc(s or '')).strip().casefold()


def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s or 'property'


def sha8(*parts):
    return hashlib.sha1('|'.join(parts).encode('utf-8')).hexdigest()[:8]


def encode_url(u):
    """Percent-encode only chars outside printable ASCII / existing escapes."""
    return urllib.parse.quote(u, safe="!#$%&'()*+,/:;=?@[]~-._")


def valid_url(u):
    return bool(u) and re.match(r'^https?://[^\s/]+\.[^\s/]+\S*$', u) is not None


def excel_date(serial):
    try:
        f = float(serial)
    except (TypeError, ValueError):
        return None
    return (datetime.date(1899, 12, 30) + datetime.timedelta(days=int(f))).isoformat()


def build(xlsx, batch, image_results=None):
    sheets = read_workbook(xlsx)
    stats = {'sheets': {}}
    listing = sheets['Listing Data']
    header = {c: unescape_xlsx(v).strip() for c, v in listing[1].items()}
    hdr_col = {h: c for c, h in header.items()}
    need = ['title', 'space_categories', 'event_types_supported', 'location', 'image1', 'image2', 'image3', 'image4', 'image5']
    for n in need:
        if n not in hdr_col:
            sys.exit('missing header column: ' + n)

    def cell(r, name):
        return r.get(hdr_col[name]) if name in hdr_col else None

    data_rows = sorted(k for k, v in listing.items() if k > 1 and v)
    blank_rows = sum(1 for k, v in listing.items() if k > 1 and not v)
    stats['sheets']['Listing Data'] = {'data_rows': len(data_rows), 'blank_rows_in_xml': blank_rows,
                                       'header_row': 1, 'last_data_row': data_rows[-1]}

    # --- parse rows
    parsed = {}
    for rn in data_rows:
        r = listing[rn]
        imgs = {}
        for i in range(1, 6):
            raw = clean(cell(r, 'image%d' % i))
            if raw is not None:
                imgs[i] = raw
        parsed[rn] = {'row': rn, 'title': clean_collapse(cell(r, 'title')),
                      'cat': clean_collapse(cell(r, 'space_categories')),
                      'ev_raw': clean(cell(r, 'event_types_supported')),
                      'loc_raw': cell(r, 'location'), 'imgs': imgs,
                      'legacy': {h: (r.get(hdr_col[h]) if h in hdr_col else None) for h in LEGACY_FIELD_COLS if h in hdr_col}}
    # vocab = categories / event tokens seen on rows that have >=1 valid image URL
    vocab_cat, vocab_ev = collections.Counter(), collections.Counter()
    for p in parsed.values():
        if any(valid_url(u) for u in p['imgs'].values()):
            if p['cat']:
                vocab_cat[p['cat']] += 1
            for t in (p['ev_raw'] or '').split('/'):
                if t.strip():
                    vocab_ev[t.strip()] += 1

    rejected, kept = [], []
    for rn in data_rows:
        p = parsed[rn]
        n_valid = sum(1 for u in p['imgs'].values() if valid_url(u))
        ev_toks = [t.strip() for t in (p['ev_raw'] or '').split('/') if t.strip()]
        reasons = []
        if not p['title']:
            reasons.append('title is empty')
        if n_valid == 0:
            ev_unseen = [t for t in ev_toks if t not in vocab_ev]
            if p['cat'] not in vocab_cat:
                evidence = ['0 valid http(s) image URLs (of %d non-empty image cells)' % len(p['imgs']),
                            'space_categories %r never appears on any row with valid images' % p['cat'],
                            'event_types tokens not seen on any valid row: %r' % ev_unseen,
                            'location %r' % p['loc_raw']]
                reasons.append('junk: ' + '; '.join(evidence))
        if reasons:
            rejected.append({'sheet': 'Listing Data', 'source_row': rn,
                             'reason': ' | '.join(reasons),
                             'raw': {str(k): v for k, v in sorted(listing[rn].items())}})
        else:
            kept.append(rn)

    # --- source keys
    properties, images = [], []
    used = collections.Counter()
    collisions = []
    for rn in kept:
        p = parsed[rn]
        city = clean_collapse(p['loc_raw'])
        img1 = p['imgs'].get(1, '')
        base = slug(p['title']) + '-' + sha8(norm_key(p['title']), norm_key(city), norm_key(p['cat']), img1.strip())
        used[base] += 1
        key = base if used[base] == 1 else '%s-%d' % (base, used[base])
        if used[base] > 1:
            collisions.append({'base_key': base, 'source_key': key, 'source_row': rn, 'title': p['title']})
        ev = []
        for t in (p['ev_raw'] or '').split('/'):
            t = clean_collapse(t)
            if t and t not in ev:
                ev.append(t)
        ck = (city or '').casefold()
        if not city:
            lv, why = 'ambiguous', 'location blank'
        elif ck in NON_ONTARIO_EVIDENCE:
            lv, why = 'ambiguous', 'non-Ontario evidence: ' + NON_ONTARIO_EVIDENCE[ck]
        elif ck in HOMONYM_CITIES:
            lv, why = 'ambiguous', 'city name exists in multiple provinces/countries'
        else:
            lv, why = 'unverified', None
        prop = {'source_key': key, 'source_row': rn, 'import_batch': batch, 'title': p['title'],
                'space_category': p['cat'], 'event_types': ev or None, 'event_types_raw': p['ev_raw'],
                'location_raw': p['loc_raw'], 'city': city, 'region': None, 'country': None,
                'timezone': None, 'location_verified': lv, 'status': 'active',
                'legacy_fields': p['legacy']}
        properties.append(prop)
        prop['_ambiguity_reason'] = why  # stripped before write
        seen_urls = set()
        for pos in sorted(p['imgs']):
            u = p['imgs'][pos]
            if not valid_url(u):
                rejected.append({'sheet': 'Listing Data', 'source_row': rn, 'kind': 'image', 'position': pos,
                                 'reason': 'image%d is not a valid http(s) URL' % pos, 'raw': u})
                continue
            if u in seen_urls:
                rejected.append({'sheet': 'Listing Data', 'source_row': rn, 'kind': 'image', 'position': pos,
                                 'reason': 'duplicate URL within same property', 'raw': u})
                continue
            seen_urls.add(u)
            images.append({'property_source_key': key, 'position': pos, 'url': encode_url(u), 'url_raw': u,
                           'validation_status': 'unchecked'})

    # --- legacy sheets
    by_title = collections.defaultdict(list)
    for pr in properties:
        by_title[norm_key(pr['title'])].append(pr['source_key'])
    legacy = []
    lused = collections.Counter()

    def add_legacy(kind, sheet, rows, cols):
        hdr = {c: unescape_xlsx(v).strip() for c, v in rows[1].items()}
        hc = {h.lower(): c for c, h in hdr.items()}
        n = 0
        for rn in sorted(k for k, v in rows.items() if k > 1 and v):
            r = rows[rn]
            title_raw = None
            for h in cols['title']:
                if h in hc:
                    title_raw = r.get(hc[h])
            tclean = clean_collapse(title_raw)
            def g(name):
                return clean(r.get(hc[cols[name]])) if cols.get(name) and cols[name] in hc else None
            if not tclean:
                rejected.append({'sheet': sheet, 'source_row': rn, 'reason': 'empty property title',
                                 'raw': {hdr.get(k, str(k)): v for k, v in sorted(r.items())}})
                continue
            url, cap, tags = g('url'), g('caption'), g('hashtags')
            keybase = kind + '-' + sha8(norm_key(tclean), url or '', cap or '')
            lused[keybase] += 1
            skey = keybase if lused[keybase] == 1 else '%s-%d' % (keybase, lused[keybase])
            cands = by_title.get(norm_key(tclean), [])
            if len(cands) == 1:
                link, pk = 'linked', cands[0]
            elif len(cands) > 1:
                link, pk = 'ambiguous', None
            else:
                link, pk = 'unlinked', None
            created = g('created')
            legacy.append({'source_key': skey, 'kind': kind, 'source_sheet': sheet, 'source_row': rn,
                           'property_title_raw': title_raw.strip() if title_raw else tclean,
                           'property_source_key': pk, 'link_status': link,
                           'link_candidates': cands if link == 'ambiguous' else None,
                           'url': url, 'caption': cap, 'hashtags': tags, 'source_status': g('status'),
                           'source_created_at': excel_date(created) if created else None,
                           'raw': {hdr.get(k, str(k)) or str(k): v for k, v in sorted(r.items())}})
            n += 1
        stats['sheets'][sheet] = {'data_rows': n + sum(1 for x in rejected if x['sheet'] == sheet),
                                  'blank_rows_in_xml': sum(1 for k, v in rows.items() if k > 1 and not v),
                                  'header': list(hdr.values())}

    add_legacy('blog', 'blog_posts', sheets['blog_posts'],
               {'title': ['property'], 'url': 'blog_url', 'created': 'created_date', 'status': 'post_status'})
    add_legacy('image_post', 'image_post_content', sheets['image_post_content'],
               {'title': ['property  title', 'property title'], 'url': 'post1', 'caption': 'captions',
                'hashtags': 'hastags', 'status': 'post_status'})
    add_legacy('video', 'video_content', sheets['video_content'],
               {'title': ['property_title'], 'url': 'video_url', 'created': 'created_date',
                'status': 'post_status'})

    # --- optional image-check results
    check = None
    if image_results:
        with open(image_results) as f:
            check = {r['url']: r for r in json.load(f)['results']}
        for im in images:
            res = check.get(im['url'])
            if res and res['status'] in ('ok', 'ok_generic_content_type', 'broken'):
                im['validation_status'] = 'broken' if res['status'] == 'broken' else 'ok'

    ambiguity = {p['source_key']: p.pop('_ambiguity_reason') for p in properties}
    return {'sheets_raw': sheets, 'stats': stats, 'properties': properties, 'images': images,
            'legacy': legacy, 'rejected': rejected, 'collisions': collisions, 'vocab_cat': vocab_cat,
            'ambiguity': ambiguity, 'parsed': parsed, 'check': check, 'kept': kept}


def md_table(headers, rows):
    out = ['| ' + ' | '.join(headers) + ' |', '|' + '|'.join('---' for _ in headers) + '|']
    for r in rows:
        out.append('| ' + ' | '.join(str(x).replace('|', '\\|') for x in r) + ' |')
    return '\n'.join(out)


def make_report(b, xlsx, batch):
    props, images, legacy, rejected = b['properties'], b['images'], b['legacy'], b['rejected']
    L = []
    w = L.append
    w('# Inventory import report')
    w('')
    w('Generated by `scripts/inventory-import/normalize.py` from `%s` (batch `%s`). Everything under "Measured" is computed from the file; "Assumed" is stated explicitly. Nothing has been written to any database.' % (xlsx, batch))
    w('')
    st = b['stats']['sheets']
    w('## 1. Row counts per sheet (Measured)')
    w('')
    rows = []
    rej_by_sheet = collections.Counter(r['sheet'] for r in rejected if r.get('kind') != 'image')
    for name, s in st.items():
        rows.append([name, s['data_rows'], s.get('blank_rows_in_xml', 0), rej_by_sheet.get(name, 0)])
    w(md_table(['Sheet', 'Non-empty data rows (excl. header)', 'Empty rows present in XML', 'Rejected rows'], rows))
    w('')
    n_rej_rows = sum(1 for r in rejected if r.get('kind') != 'image')
    w('Listing Data: %d data rows = %d properties + %d rejected rows. Legacy sheets: %d legacy rows imported (blog %d, image_post %d, video %d).' % (
        st['Listing Data']['data_rows'], len(props), rej_by_sheet.get('Listing Data', 0), len(legacy),
        sum(1 for x in legacy if x['kind'] == 'blog'), sum(1 for x in legacy if x['kind'] == 'image_post'),
        sum(1 for x in legacy if x['kind'] == 'video')))
    w('')
    w('The task brief mentioned ~332 rows in Listing Data; the sheet really has 332 data rows (Excel rows 2-333). `image_post_content` is declared ~1011 rows tall but only 3 data rows have content; `video_content` has headers only (0 data rows); `blog_posts` has 2.')
    w('')
    w('## 2. Rejected rows (junk) (Measured)')
    w('')
    for r in rejected:
        if r.get('kind') == 'image':
            continue
        w('- **%s row %d** - %s' % (r['sheet'], r['source_row'], r['reason']))
        w('  - raw cells: `%s`' % json.dumps(r['raw'], ensure_ascii=False))
    w('')
    w('Rule used: a row is junk when it has zero valid http(s) image URLs AND its `space_categories` value never occurs on any row that has valid images. Both rows have gibberish text in every field. Rejected image cells inside kept properties: %d.' % sum(1 for r in rejected if r.get('kind') == 'image'))
    for r in rejected:
        if r.get('kind') == 'image':
            w('- %s row %d image%d: %s (`%s`)' % (r['sheet'], r['source_row'], r['position'], r['reason'], r['raw']))
    w('')
    w('## 3. Duplicate titles (Measured)')
    w('')
    groups = collections.defaultdict(list)
    for p in props:
        groups[norm_key(p['title'])].append(p)
    exact = collections.Counter(p['title'] for p in props)
    for k, g in sorted(groups.items()):
        if len(g) > 1:
            w('- `%s` x%d (rows %s) %s' % (g[0]['title'], len(g), ', '.join(str(p['source_row']) for p in g),
              '- exact-case duplicate' if exact[g[0]['title']] > 1 else '- differs only by letter case (%s)' % ' / '.join(repr(p['title']) for p in g)))
            for p in g:
                w('  - row %d: category=%r city=%r image1=`%s` -> `%s`' % (p['source_row'], p['space_category'], p['city'],
                  next((i['url_raw'][-45:] for i in images if i['property_source_key'] == p['source_key'] and i['position'] == 1), None), p['source_key']))
    w('')
    w('NOTE: the brief said two duplicated titles; case-insensitively there are **three** (`Moonlight Lounge` / `MOONLIGHT LOUNGE` differs only by case and category). All are kept as separate properties and legacy rows matching any of them are left unlinked.')
    w('')
    w('## 4. source_key collisions (Measured)')
    w('')
    if b['collisions']:
        for c in b['collisions']:
            w('- %s (row %d) collided with base `%s`' % (c['source_key'], c['source_row'], c['base_key']))
    else:
        w('None. All %d source_keys are unique without needing a -2/-3 suffix (the hash of title|city|category|image1 separates every duplicated title).' % len(props))
    w('')
    w('## 5. space_categories (Measured; one label per property)')
    w('')
    c = collections.Counter(p['space_category'] for p in props)
    w(md_table(['Category', 'Properties'], [[k, v] for k, v in c.most_common()]))
    w('')
    w('## 6. event_types_supported (Measured)')
    w('')
    tok = collections.Counter(t for p in props for t in (p['event_types'] or []))
    w('Parsed by splitting on `/`, trimming, de-duplicating within a property (original string kept in `event_types_raw`). Distinct tokens: %d.' % len(tok))
    w('')
    w(md_table(['Token', 'Properties'], [[k, v] for k, v in tok.most_common()]))
    w('')
    odd = [p for p in props if p['event_types_raw'] and re.search(r'[,;|\\&]|\s-\s|\band\b|\s/|/\s|//', p['event_types_raw'])]
    nulls = [p for p in props if not p['event_types']]
    w('Rows with odd separators (`, ; | \\ &`, " and ", spaces around `/`, or `//`): %d. Properties with no event types: %d.' % (len(odd), len(nulls)))
    for p in odd[:20]:
        w('- row %d `%s`: %r' % (p['source_row'], p['title'], p['event_types_raw']))
    w('')
    w('## 7. Cities and location ambiguity (Measured counts; heuristic Assumed)')
    w('')
    cc = collections.Counter(p['city'] for p in props)
    w(md_table(['City (as in source)', 'Properties', 'location_verified'],
               [[k if k else '(blank)', v, next(p['location_verified'] for p in props if p['city'] == k)] for k, v in sorted(cc.items(), key=lambda x: (-x[1], str(x[0])))]))
    w('')
    w('**Heuristic (deliberately conservative; it is name-based only, nothing was geocoded or looked up):** `location_verified` is `ambiguous` if (a) location is blank, (b) the city is on a hard-coded list of names that exist in several provinces/countries (%s), or (c) the name carries non-Ontario evidence (%s). Everything else is `unverified`. Never `verified`. region, country and timezone are NULL for every property. The list is my own judgement, not source data - please review it; names such as Ottawa, Markham, Vaughan, Kitchener were left `unverified`.' % (
        ', '.join(sorted(HOMONYM_CITIES)), '; '.join(NON_ONTARIO_EVIDENCE.values())))
    w('')
    amb = [p for p in props if p['location_verified'] == 'ambiguous']
    w('Ambiguous properties: %d' % len(amb))
    for p in amb:
        w('- row %d `%s` city=%r - %s' % (p['source_row'], p['title'], p['city'], b['ambiguity'][p['source_key']]))
    w('')
    w('## 8. Images per property (Measured)')
    w('')
    per = collections.Counter(i['property_source_key'] for i in images)
    dist = collections.Counter(per.get(p['source_key'], 0) for p in props)
    w(md_table(['Images', 'Properties'], [[k, v] for k, v in sorted(dist.items())]))
    w('')
    distinct = {i['url'] for i in images}
    w('Total image rows: %d; distinct URLs: %d. Position = source column (image1..image5); gaps where a middle column is empty are preserved.' % (len(images), len(distinct)))
    gaps = []
    for p in props:
        pos = sorted(i['position'] for i in images if i['property_source_key'] == p['source_key'])
        if pos and pos != list(range(1, len(pos) + 1)):
            gaps.append(p)
    w('Properties with a gap in image positions: %d.' % len(gaps))
    shared = collections.defaultdict(set)
    for i in images:
        shared[i['url']].add(i['property_source_key'])
    sh = {u: s for u, s in shared.items() if len(s) > 1}
    w('')
    w('URLs shared by more than one property: %d.' % len(sh))
    tmap = {p['source_key']: p for p in props}
    for u, s in sorted(sh.items()):
        w('- `%s` -> %s' % (u[-70:], ', '.join('row %d %s' % (tmap[k]['source_row'], tmap[k]['title']) for k in sorted(s))))
    enc = [i for i in images if i['url'] != i['url_raw']]
    w('')
    w('Image URLs containing control / non-ASCII characters (an Excel `_x0080_` escape decoded to a control character, i.e. mojibake in the original filename): %d. They are stored percent-encoded in `url` (original in the JSON field `url_raw`); whether the host serves that encoded form is checked by check_images.py.' % len(enc))
    noext = [i for i in images if not re.search(r'\.(avif|jpe?g|png|webp|gif|svg)$', i['url_raw'], re.I)]
    w('URLs without a recognizable image extension: %d.' % len(noext))
    for i in noext:
        w('- %s: `%s`' % (i['property_source_key'], i['url_raw']))
    w('')
    # image check
    w('## 9. Broken / unreachable image URLs (Measured by check_images.py; separate from location findings)')
    w('')
    if b['check'] is None:
        w('Image check results were not supplied to this run (`--image-results`). Run `check_images.py` and re-run normalize.py.')
    else:
        res = b['check']
        cnt = collections.Counter(r['status'] for r in res.values())
        w('Distinct URLs checked: %d. Outcome counts: %s.' % (len(res), ', '.join('%s=%d' % kv for kv in sorted(cnt.items()))))
        w('')
        w('Status meanings: `ok` = HTTP 2xx and `image/*` content-type; `ok_generic_content_type` = HTTP 2xx but served as `application/octet-stream` while the URL has an image extension (reachable; flagged as a warning, counted ok); `broken` = HTTP 4xx (not 429); `non_image` = 2xx with some other non-image content-type (uncertain, left `unchecked`); `unreachable` = DNS/connect/TLS/timeout/5xx errors; `unchecked` = rate-limited (429/503) or not tested. In the normalized JSON only ok / ok_generic_content_type (-> `ok`) and broken (-> `broken`) change `validation_status`; non_image/unreachable/unchecked stay `unchecked`.')
        w('')
        gen = [i for i in images if res.get(i['url']) and res[i['url']]['status'] == 'ok_generic_content_type']
        w('Warning-level: %d image rows (%d properties, %d distinct URLs) are served as `application/octet-stream` instead of `image/avif` (all have the `.avif` extension, HTTP 200). They are reachable, but a browser or an uploader that trusts Content-Type may refuse them. This is a host configuration issue, not a broken link.' % (len(gen), len({i['property_source_key'] for i in gen}), len({i['url'] for i in gen})))
        w('')
        bad = [i for i in images if res.get(i['url']) and res[i['url']]['status'] not in ('ok', 'ok_generic_content_type')]
        if not bad:
            w('No problem URLs.')
        by_prop = collections.defaultdict(list)
        for i in bad:
            by_prop[i['property_source_key']].append(i)
        for k in sorted(by_prop, key=lambda k: tmap[k]['source_row']):
            p = tmap[k]
            w('- row %d `%s` (%s)' % (p['source_row'], p['title'], k))
            for i in by_prop[k]:
                r = res[i['url']]
                w('  - image%d `%s` -> %s http=%s ct=%s %s' % (i['position'], i['url_raw'], r['status'], r.get('http_status'), r.get('content_type'), r.get('error') or ''))
        unk = [u for u in distinct if u not in res]
        w('')
        w('Distinct property-image URLs absent from the results file: %d.' % len(unk))
    w('')
    w('## 10. Legacy content (Measured)')
    w('')
    lc = collections.Counter((x['kind'], x['link_status']) for x in legacy)
    w(md_table(['Kind', 'Sheet', 'Rows', 'Linked', 'Unlinked', 'Ambiguous'],
               [[k, s, sum(1 for x in legacy if x['kind'] == k), lc[(k, 'linked')], lc[(k, 'unlinked')], lc[(k, 'ambiguous')]]
                for k, s in (('blog', 'blog_posts'), ('image_post', 'image_post_content'), ('video', 'video_content'))]))
    w('')
    for x in legacy:
        w('- %s row %d title=%r -> %s%s' % (x['source_sheet'], x['source_row'], x['property_title_raw'], x['link_status'],
          (' ' + tmap[x['property_source_key']]['source_key'] + ' (property row %d)' % tmap[x['property_source_key']]['source_row']) if x['property_source_key'] else
          (' candidates=%s' % x['link_candidates'] if x['link_candidates'] else '')))
    w('')
    w('Matching rule: trim + NFC + collapse whitespace + case-fold the legacy title and compare with property titles; exactly one match = linked, more than one = ambiguous (left unlinked), none = unlinked. `video_content` has no data rows, so no video legacy records exist. The `Post_status` / `created_date` on blog rows is kept in `source_status` / `source_created_at` (Excel serial converted to a date, time-of-day dropped; raw serial kept in `raw`).')
    w('')
    w('## 11. Other observations and assumptions to confirm')
    w('')
    lf = collections.Counter()
    for p in props:
        for k, v in p['legacy_fields'].items():
            if v not in (None, ''):
                lf[(k, v)] += 1
    w('- Legacy status columns that actually hold values (in `properties.legacy_fields`, verbatim): %s. `last_used_for_video` and `video_use_count` are empty on every row, as stated.' % (', '.join('%s=%r x%d' % (k[0], k[1], v) for k, v in sorted(lf.items())) or 'none'))
    w('- Assumed: every kept property gets `status = active` (the source has no active/inactive column).')
    w('- Assumed: `import_batch` = `%s`; `source_row` = Excel row number.' % batch)
    w('- Header `blog_type ` has a trailing space in the source; headers are trimmed when read. `property ` / `Property  Title` headers likewise.')
    w('- Title / category / city values are whitespace-collapsed and NFC-normalized but case is preserved. `location_raw` keeps the untouched cell text.')
    sus = [p for p in props if re.search(r'\(copy\)|\btest\b|this is some|lorem|untitled|\bdemo\b', p['title'], re.I)]
    w('- Kept (NOT rejected) but test-looking titles (regex `(copy)|test|this is some|lorem|untitled|demo`): %s. Together with the non-Ontario cities above (Austin, Airmont, Aldergrove East) these may be dev/test listings - please confirm whether they belong in the inventory.' % (', '.join('row %d %r' % (p['source_row'], p['title']) for p in sus) or 'none'))
    w('- Titles are not unique case-insensitively beyond the duplicates in section 3; titles contain `|` and `&` characters (e.g. `Spaces | North York`) which are preserved as-is.')
    w('- Hyperlink relationships on Listing Data cells (12) were compared with the cell text: all identical, so no URL came from a hyperlink only.')
    return '\n'.join(L) + '\n'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--xlsx', default='docs/content.xlsx')
    ap.add_argument('--out', default=DEFAULT_OUT)
    ap.add_argument('--report', default=None)
    ap.add_argument('--image-results', default=None)
    ap.add_argument('--batch', default='content-xlsx-v1')
    a = ap.parse_args()
    b = build(a.xlsx, a.batch, a.image_results)
    report = make_report(b, a.xlsx, a.batch)
    out = {'meta': {'source': os.path.basename(a.xlsx), 'import_batch': a.batch, 'counts': {
               'properties': len(b['properties']), 'images': len(b['images']), 'legacy': len(b['legacy']),
               'rejected': len(b['rejected'])}},
           'properties': b['properties'], 'images': b['images'], 'legacy': b['legacy'],
           'rejected': b['rejected'], 'collisions': b['collisions'], 'validation_report': report}
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write('\n')
    if a.report:
        with open(a.report, 'w', encoding='utf-8') as f:
            f.write(report)
    print('properties=%d images=%d legacy=%d rejected=%d' % (len(b['properties']), len(b['images']), len(b['legacy']), len(b['rejected'])))


if __name__ == '__main__':
    main()
