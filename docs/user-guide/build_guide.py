"""Builds the Kinetix user guide PDF for the Kangrooo team. Usage: python build_guide.py <output.pdf>"""
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle, PageBreak,
    KeepTogether, NextPageTemplate, ListFlowable, ListItem, CondPageBreak,
)

# ---- fonts & colours ---------------------------------------------------------------
FONT_DIR = "/usr/share/fonts/truetype/noto/"
pdfmetrics.registerFont(TTFont("Sans", FONT_DIR + "NotoSans-Regular.ttf"))
pdfmetrics.registerFont(TTFont("Sans-Bold", FONT_DIR + "NotoSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Sans-Italic", FONT_DIR + "NotoSans-Italic.ttf"))
pdfmetrics.registerFontFamily("Sans", normal="Sans", bold="Sans-Bold", italic="Sans-Italic", boldItalic="Sans-Bold")

INK = colors.HexColor("#101114")
MUTED = colors.HexColor("#686b82")
BORDER = colors.HexColor("#dedee5")
SURFACE = colors.HexColor("#f5f5f8")
LINK = "#2563eb"
TONES = {
    "info": (colors.HexColor("#eff6ff"), colors.HexColor("#3b82f6")),
    "tip": (colors.HexColor("#ecfdf5"), colors.HexColor("#149e61")),
    "warn": (colors.HexColor("#fffbeb"), colors.HexColor("#f59e0b")),
    "danger": (colors.HexColor("#fef2f2"), colors.HexColor("#ef4444")),
}

def style(name, **kw):
    base = dict(fontName="Sans", fontSize=10, leading=14.5, textColor=INK, spaceAfter=6)
    base.update(kw)
    return ParagraphStyle(name, **base)

S = {
    "body": style("body"),
    "muted": style("muted", textColor=MUTED, fontSize=9, leading=13),
    "h1": style("h1", fontName="Sans-Bold", fontSize=22, leading=27, spaceBefore=0, spaceAfter=4),
    "h1sub": style("h1sub", textColor=MUTED, fontSize=11, leading=15, spaceAfter=16),
    "h2": style("h2", fontName="Sans-Bold", fontSize=14, leading=18, spaceBefore=14, spaceAfter=6),
    "h3": style("h3", fontName="Sans-Bold", fontSize=11, leading=15, spaceBefore=8, spaceAfter=3),
    "cell": style("cell", fontSize=9, leading=12.5, spaceAfter=0),
    "cellb": style("cellb", fontName="Sans-Bold", fontSize=9, leading=12.5, spaceAfter=0),
    "cellh": style("cellh", fontName="Sans-Bold", fontSize=8.5, leading=11, textColor=MUTED, spaceAfter=0),
    "callout": style("callout", fontSize=9.5, leading=13.5, spaceAfter=0),
    "toc": style("toc", fontSize=11, leading=20, spaceAfter=0),
    "cover_title": style("ct", fontName="Sans-Bold", fontSize=34, leading=40, spaceAfter=10),
    "cover_sub": style("cs", fontSize=14, leading=20, textColor=MUTED, spaceAfter=0),
}

def link(url, text=None):
    return f'<a href="{url}" color="{LINK}">{text or url}</a>'

def P(text, s="body"):
    return Paragraph(text, S[s] if isinstance(s, str) else s)

def H1(title, sub=None):
    out = [P(title, "h1")]
    if sub:
        out.append(P(sub, "h1sub"))
    return out

def H2(t):
    return P(t, "h2")

def H3(t):
    return P(t, "h3")

def bullets(items, s="body"):
    return ListFlowable([ListItem(P(i, s), leftIndent=12, value="•") for i in items],
                        bulletType="bullet", start="•", leftIndent=12, bulletFontName="Sans", bulletFontSize=9, spaceAfter=4)

def steps(items):
    return ListFlowable([ListItem(P(i), leftIndent=16) for i in items],
                        bulletType="1", leftIndent=16, bulletFontName="Sans-Bold", bulletFontSize=9.5, spaceAfter=4)

def callout(kind, title, text):
    bg, bar = TONES[kind]
    body = P(f"<b>{title}</b>  {text}" if title else text, "callout")
    t = Table([[ "", body ]], colWidths=[4, 6.5 * inch - 4])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("BACKGROUND", (0, 0), (0, 0), bar),
        ("LEFTPADDING", (1, 0), (1, 0), 10), ("RIGHTPADDING", (1, 0), (1, 0), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (0, 0), 0), ("RIGHTPADDING", (0, 0), (0, 0), 0),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return KeepTogether([Spacer(1, 4), t, Spacer(1, 8)])

def table(header, rows, widths, bold_first=True):
    data = [[P(h, "cellh") for h in header]]
    for r in rows:
        data.append([P(c, "cellb" if (i == 0 and bold_first) else "cell") for i, c in enumerate(r)])
    t = Table(data, colWidths=[w * inch for w in widths], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SURFACE),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, BORDER),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
    ]))
    return t

def trouble(entries):
    """entries: (what you see, what it means, what to do)."""
    return table(["What you see", "What it means", "What to do"], entries, [2.05, 1.85, 2.6])

# ---- page templates ------------------------------------------------------------------
W, H = letter
MARGIN = 0.9 * inch

def on_cover(c, doc):
    c.saveState()
    c.setFillColor(INK)
    c.rect(0, H - 0.35 * inch, W, 0.35 * inch, stroke=0, fill=1)
    c.setFont("Sans", 9)
    c.setFillColor(MUTED)
    c.drawString(MARGIN, 0.6 * inch, "Kinetix · Kangrooo content automation")
    c.restoreState()

def on_page(c, doc):
    c.saveState()
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.5)
    c.line(MARGIN, H - 0.62 * inch, W - MARGIN, H - 0.62 * inch)
    c.setFont("Sans-Bold", 8.5)
    c.setFillColor(INK)
    c.drawString(MARGIN, H - 0.52 * inch, "Kinetix User Guide")
    c.setFont("Sans", 8.5)
    c.setFillColor(MUTED)
    c.drawRightString(W - MARGIN, H - 0.52 * inch, "For the Kangrooo team")
    c.drawRightString(W - MARGIN, 0.55 * inch, f"{doc.page}")
    c.restoreState()

def build(out):
    doc = BaseDocTemplate(out, pagesize=letter, leftMargin=MARGIN, rightMargin=MARGIN,
                          topMargin=0.95 * inch, bottomMargin=0.85 * inch,
                          title="Kinetix User Guide", author="Kinetix", subject="How to use Kinetix content automation")
    frame = Frame(MARGIN, 0.85 * inch, W - 2 * MARGIN, H - 1.8 * inch, id="f", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate("cover", [frame], onPage=on_cover), PageTemplate("page", [frame], onPage=on_page)])
    story = []
    A = story.append

    # ---- cover ------------------------------------------------------------------------
    A(Spacer(1, 1.6 * inch))
    A(P("Kinetix", "cover_title"))
    A(P("User Guide", style("x", fontName="Sans-Bold", fontSize=22, leading=28, textColor=MUTED, spaceAfter=24)))
    A(P("How to use Kinetix to create and publish content for Kangrooo's listings — automatically, "
        "on social media and on the Kangrooo blog.", "cover_sub"))
    A(Spacer(1, 0.5 * inch))
    A(P("For the Kangrooo team · November 2026", "muted"))
    A(NextPageTemplate("page"))
    A(PageBreak())

    # ---- contents ---------------------------------------------------------------------
    story.extend(H1("What's in this guide"))
    toc = [
        ("1", "What Kinetix does", "The big picture, in two minutes"),
        ("2", "Testing and Live", "The most important switch in the app"),
        ("3", "Finding your way around", "Signing in and the sidebar"),
        ("4", "Dashboard", "How things are going, and what needs you"),
        ("5", "Content Gallery", "Everything the AI made, and what happened to it"),
        ("6", "Listings", "The venues Kinetix promotes"),
        ("7", "Automation", "Live mode, weekly runs and how much to make"),
        ("8", "Posts", "Making your own one-off social posts"),
        ("9", "Connected Accounts", "Linking your social media accounts"),
        ("10", "Settings", "Your business details and brand voice"),
        ("11", "Everyday tasks, step by step", "Going Live, your weekly routine and more"),
        ("12", "When something goes wrong", "Common messages and how to fix them"),
        ("13", "Good to know", "Quick answers to common questions"),
    ]
    A(table(["", "Section", "What it covers"], [[n, f"<b>{t}</b>", d] for n, t, d in toc], [0.35, 2.4, 3.75], bold_first=False))
    A(PageBreak())

    # ---- 1. what it does --------------------------------------------------------------
    story.extend(H1("1. What Kinetix does", "Kinetix keeps Kangrooo's social media and blog active without anyone writing or scheduling posts by hand."))
    A(P("Every week, Kinetix picks venues from your <b>Listings</b>, looks at their photos and details, and creates content about them with AI. "
        "It then decides the best day and time to post each piece and — once you've switched it on — publishes it for you."))
    A(H2("What it makes"))
    A(table(["Content", "What it is", "Where it goes"], [
        ["Social image", "A 4:5 picture of the venue with a caption and hashtags written for each platform.", "TikTok, Instagram and Facebook"],
        ["Social video", "A 30-second vertical video with a narrator describing the venue, ending on the Kangrooo logo.", "TikTok, Instagram and Facebook"],
        ["LinkedIn post", "A professional post with an image that carries a short headline.", "LinkedIn"],
        ["Blog post", "A full article about one venue, with images, written for people planning an event.", f"The Kangrooo blog ({link('https://blog.kangrooo.ca', 'blog.kangrooo.ca')})"],
    ], [1.25, 3.3, 1.95]))
    A(H2("How a week works"))
    A(steps([
        "<b>Friday 6:00 pm (Toronto time)</b> — Kinetix plans the coming Monday-to-Sunday week: how many of each type to make (you set this in <b>Automation</b>) and when each one should go out.",
        "<b>Friday evening</b> — the AI creates the content. It takes a little while; you can watch it appear in the <b>Content Gallery</b>.",
        "<b>Through the week</b> — each post and blog is published at its planned time. The <b>Dashboard</b> shows what's coming up, what went out, and anything that needs your attention.",
    ]))
    A(P("It rotates through your listings fairly: every active venue gets its turn before any venue is repeated, and a newly added venue is picked next."))
    A(H2("Two ways to post"))
    A(bullets([
        "<b>Automatic</b> — the weekly content described above, managed in <b>Content Gallery</b> and <b>Automation</b>.",
        "<b>Your own posts</b> — anything else you want to share, any time, from the <b>Posts</b> page (for example a holiday greeting or an announcement). You can generate an image with AI or upload your own.",
    ]))
    A(callout("info", "You stay in control.", "Nothing is published until you switch on Live mode, and you can pause everything with one switch at any time."))
    A(CondPageBreak(3.2 * inch))

    # ---- 2. testing vs live -----------------------------------------------------------
    story.extend(H1("2. Testing and Live", "One switch decides whether content stays private or is published."))
    A(table(["", "Testing", "Live"], [
        ["What happens to new content", "Stays private in the Content Gallery. Nothing is ever published.", "Published automatically at its planned time — social posts to your accounts, blogs to the website."],
        ["Good for", "Trying things out, checking the quality, adjusting your brand voice.", "Running Kangrooo's social media and blog on autopilot."],
        ["Generate now button", "Creates content for next week, privately.", "Creates content now and publishes it within the next 7 days."],
        ["Who can switch", "Owners and admins", "Owners and admins"],
    ], [1.6, 2.45, 2.45]))
    A(Spacer(1, 6))
    A(callout("tip", "Testing content is never published.", "Everything made while in Testing stays private for good — switching to Live later only affects new content."))
    A(callout("warn", "Pausing.", "In Automation you can also pause generation entirely. While paused (or when switched back to Testing), anything waiting to be published is put on hold and goes out when you resume — unless its time passed more than 6 hours ago."))
    A(H2("Where to switch"))
    A(P("Go to <b>Automation</b> in the sidebar. The <b>Live mode</b> switch asks you to confirm and tells you exactly what will happen. The same page has the <b>Automatic weekly runs</b> switch, which turns the Friday run on or off."))
    A(CondPageBreak(3.2 * inch))

    # ---- 3. navigation ----------------------------------------------------------------
    story.extend(H1("3. Finding your way around"))
    A(H2("Signing in"))
    A(P("Open Kinetix in your browser and sign in with the username and password you were given. There's no sign-up page — new logins are created by your Kinetix support contact. "
        "To sign out, use the round profile button in the top-right corner."))
    A(H2("The sidebar"))
    A(P("Everything is one click away in the sidebar on the left:"))
    A(table(["Sidebar item", "What it's for"], [
        ["Dashboard", "Your home page: how your social media is performing, what automation is doing, and anything that needs your attention."],
        ["CONTENT", ""],
        ["   Content Gallery", "Everything the AI has created, with previews, captions, posting times and what happened when it was published."],
        ["   Listings", "The venues Kinetix promotes. Add new ones, look at their photos, or take one out of the rotation."],
        ["   Automation", "Live/Testing, the weekly run, and how many of each content type to make per week."],
        ["SOCIAL", ""],
        ["   Posts", "Your own one-off posts: create, schedule, publish, and see drafts, scheduled, published and failed posts."],
        ["   Connected Accounts", "Which social media accounts are linked, and a shortcut to link more."],
        ["Settings (bottom)", "Your business details, brand voice and an estimate of monthly usage costs."],
    ], [1.75, 4.75]))
    A(callout("tip", "Tip:", "Most pages open details in a panel that slides in from the right. Click outside it or press Esc to close it."))
    A(CondPageBreak(3.2 * inch))

    # ---- 4. dashboard ---------------------------------------------------------------
    story.extend(H1("4. Dashboard", "Your home page. Start here every day."))
    A(H2("Needs attention"))
    A(P("If anything has gone wrong — or is about to — a box appears at the very top. <font color='#ef4444'><b>Red items</b></font> are problems that stop things from being published; "
        "<font color='#b45309'><b>amber items</b></font> are worth a look. Each item says what happened, shows the latest error message, and has a link to the page where you can fix it. "
        "When everything is fine, the box doesn't appear at all."))
    A(P("Section 12 lists the messages you might see and what to do about each one."))
    A(H2("Date range"))
    A(P("The buttons at the top right — <b>7 days, 14 days, 1 month, 3 months, 6 months</b> — change the period for impressions (the trend chart, the impressions total and impressions by platform)."))
    A(H2("The numbers"))
    A(table(["Tile", "What it means"], [
        ["Followers", "Total followers across all your connected accounts, right now."],
        ["Impressions", "How many times your content was seen, over the date range you picked."],
        ["Reach", "How many different people/accounts saw your content, as each platform reports it."],
        ["Engagement", "Likes, comments, shares and saves added together."],
        ["Connected accounts", "How many social media accounts are linked to Kinetix."],
    ], [1.6, 4.9]))
    A(H2("Charts and sections"))
    A(bullets([
        "<b>Impressions</b> — a day-by-day chart for the date range. <b>Engagement breakdown</b> — likes vs comments vs shares vs saves.",
        "<b>Platforms</b> — followers, reach and engagement per platform. <b>Impressions by platform</b> — which platform is seen most. (Facebook reports a rolling 30-day figure, so over long ranges its number looks higher than it really is.)",
        "<b>Content Automation</b> — Testing or Live, when the next weekly run is, how much of this week's content is ready, what's <b>up next</b> (with times) and what was <b>recently published</b> (with links).",
        "<b>Platform health</b> — which platforms are connected. <b>Audience</b> — age and gender of your Instagram followers (appears once Instagram has enough followers to report it).",
    ]))
    A(callout("info", "Numbers come straight from the platforms.", "The Dashboard asks your social accounts for fresh numbers every time it opens, so it can take a few seconds to load."))
    A(CondPageBreak(3.2 * inch))

    # ---- 5. content gallery -----------------------------------------------------------
    story.extend(H1("5. Content Gallery", "Everything the AI has made — and, in Live mode, what happened when it was published."))
    A(P("Each card shows a preview, the venue, the type of content and when it's planned to go out. Use the two drop-downs to show only <b>Videos, Images, LinkedIn</b> or <b>Blogs</b>, or only items with a certain status. "
        "The activity panel near the top shows content that is being created right now."))
    A(H2("Generate now"))
    A(P("The <b>Generate now</b> button (top right) makes extra content on the spot. Choose which types to include — one of each is made per click — and confirm."))
    A(bullets([
        "<b>In Testing</b>: creates private content for next week. Nothing is published.",
        "<b>In Live</b>: creates content and publishes each piece at an AI-chosen time in the next 7 days, in addition to the weekly run. Only owners and admins can do this.",
    ]))
    A(P("It takes a few minutes per item (videos take longest). New cards appear on their own as they finish."))
    A(H2("Opening an item"))
    A(P("Click a card to open its details on the right:"))
    A(bullets([
        "<b>Preview</b> — the image or video, or (for blogs) the full article as a reader would see it, with a <b>Copy Markdown</b> button.",
        "<b>Captions per platform</b> — the exact text and hashtags each platform will get.",
        "<b>Quality checks</b> and <b>Why the AI chose this</b> — how the AI reviewed its own work, and the idea behind the piece.",
        "<b>Publishing</b> (Live) — one row per platform with its time and status: Scheduled, On hold, Publishing, Published (with a <b>View</b> link), Failed (with the reason and a <b>Retry</b> button), Skipped, or <b>Unconfirmed</b> (see below). Platforms that couldn't be scheduled are listed with the reason.",
        "<b>WordPress</b> (Live blogs) — the planned publish time, its status, and a link to the live article once it's up.",
        "<b>Proposed posting times</b> (Testing) — when the AI would post it. These are suggestions only in Testing.",
    ]))
    A(H2("Regenerate and delete"))
    A(P("<b>Regenerate</b> makes a new version of an item; you can add a note for the AI, e.g. <i>\"make it feel more like a team offsite\"</i>. The current version stays until the new one is ready. "
        "<b>Delete</b> removes an item permanently."))
    A(callout("warn", "In Live mode, finished items are locked.", "Each item is scheduled for publishing the moment it's ready, and from then on it can't be regenerated or deleted — so what goes out always matches what you see here. In Testing you can regenerate and delete freely. To stop Live content going out, pause Generation in Automation (this holds everything)."))
    A(H3("\"Unconfirmed\" posts"))
    A(P("Very occasionally a platform doesn't confirm whether a post went out (for example after a network hiccup). Kinetix will never re-send it on its own, to avoid posting twice. "
        "Check the account: if the post is there, click <b>It's live</b>; if not, click <b>It didn't post</b>, then <b>Retry</b>."))
    A(CondPageBreak(3.2 * inch))

    # ---- 6. listings --------------------------------------------------------------
    story.extend(H1("6. Listings", "The venues and spaces Kinetix promotes."))
    A(P("The table shows every listing with its category, city and whether it's in the content rotation. Use the search box to find a listing by name, city or category, and click any row to open it."))
    A(H2("Inside a listing"))
    A(bullets([
        "<b>Photos</b> — the reference photos the AI works from. The better the photos, the better the content.",
        "<b>Details</b> — category, location and the events it suits.",
        "<b>Rotation</b> — whether it's included, when it was last promoted and what has been made for it.",
        "<b>Included in rotation</b> switch — turn it off to stop a venue being featured (for example if it's no longer available). Its history is kept, and you can switch it back on any time.",
    ]))
    A(H2("Adding a listing"))
    A(steps([
        "Click <b>Add listing</b> (top right).",
        "Fill in the name (e.g. <i>Sunlit Loft Studio</i>), category, city and the events it suits, separated by commas (e.g. <i>Birthday party, Workshop, Photo shoot</i>).",
        "Add photos — JPEG, PNG or WebP, up to 10 MB each. The first photo is the thumbnail. Clear, well-lit photos of the actual space work best.",
        "Click <b>Add listing</b>. New listings are active straight away and are picked next in the rotation.",
    ]))
    A(callout("tip", "Only describe what's really there.", "The AI only talks about what it can see in the photos and what the listing says. It won't invent prices, capacity or features — so add the details you want mentioned."))

    # ---- 7. automation --------------------------------------------------------------
    A(CondPageBreak(3 * inch))
    story.extend(H1("7. Automation", "How much to make, and whether it's published."))
    A(table(["Setting", "What it does"], [
        ["Generation enabled / paused", "The master switch. When paused, nothing is created or published (anything waiting is held). Needed for Generate now and the weekly run."],
        ["Live mode", "Testing (private) or Live (published). See section 2. You'll be asked to confirm."],
        ["Automatic weekly runs", "When on, Kinetix plans and creates the next week's content every Friday at 6:00 pm Toronto time."],
        ["Weekly frequency", "How many of each to make per week: social images, social videos, LinkedIn posts, blog posts (0–14 each; images and videos together at most 14). Click <b>Save</b> after changing them."],
    ], [1.8, 4.7]))
    A(callout("tip", "Start small.", "When you first go Live, try 1–2 of each type per week, check the results on the Dashboard and in the Content Gallery, then increase."))
    A(P("Only owners and admins can change the switches.", "muted"))
    A(CondPageBreak(3.2 * inch))

    # ---- 8. posts -------------------------------------------------------------------
    story.extend(H1("8. Posts", "Your own one-off social posts, separate from the automatic content."))
    A(P("The tabs at the top filter your posts: <b>All, Drafts, Scheduled, Published</b> and <b>Failed</b>, each with a count. "
        "A post that went out on some platforms but failed on another appears under both Published and Failed."))
    A(H2("Creating a post"))
    A(steps([
        "Click <b>Create Post</b>.",
        "Choose <b>Generate with AI</b> (describe your idea and pick a format, aspect ratio and platforms) or <b>Upload instead</b> (use your own image or video). "
        "A text-only post (no image) can go to Facebook, X and LinkedIn.",
        "Click <b>Generate</b> or <b>Upload</b>. A draft card appears; AI images take a short moment.",
        "On the card, click <b>Publish</b>: pick the platforms, then check the <b>preview</b> for each one. You can edit each caption or use <b>Improve with AI</b>.",
        "Choose <b>Post Now</b> or <b>Schedule</b> for a date and time.",
    ]))
    A(H2("Card actions"))
    A(table(["Button", "When it appears", "What it does"], [
        ["Publish", "Drafts", "Opens the publish steps above."],
        ["View details", "Always", "Shows the post, its captions and status per platform."],
        ["Retry", "Failed posts", "Tries again. Read the error first — for an AI image, Retry makes a new image."],
        ["Cancel schedule", "Scheduled posts", "Stops a scheduled post and turns it back into a draft. If it can't be cancelled, you'll be told it will still be posted."],
        ["Delete", "Most posts", "Removes the post from Kinetix. A post already live on a platform stays live there. A scheduled post is cancelled first."],
    ], [1.3, 1.45, 3.75]))
    A(callout("info", "No double posting.", "Kinetix won't send the same post twice, even if you click twice or have the page open in two tabs. If you see \"Not sent: this post is already…\", it was already sent — check the Published tab."))

    # ---- 9. connected accounts ------------------------------------------------------
    A(CondPageBreak(3 * inch))
    story.extend(H1("9. Connected Accounts", "Which social media accounts Kinetix can post to."))
    A(P("Kinetix publishes through a service called <b>Upload-Post</b>. You link your TikTok, Instagram, Facebook, LinkedIn (and X, YouTube) accounts there, and this page shows which ones are connected. Opening the page refreshes the status."))
    A(steps([
        f"Click <b>Manage on Upload-Post</b> (or go to {link('https://app.upload-post.com/manage-users', 'app.upload-post.com/manage-users')}) and sign in.",
        "Connect or reconnect the account there.",
        "Come back to <b>Connected Accounts</b> in Kinetix — the card should now say connected.",
    ]))
    A(callout("warn", "Facebook and LinkedIn need a Page.", "Automatic posts go to your Facebook Page and LinkedIn company Page. If the Dashboard says one has \"no page selected\", make sure the Page (not just your personal profile) is connected on Upload-Post, then open Connected Accounts again."))

    # ---- 10. settings ---------------------------------------------------------------
    A(CondPageBreak(2.5 * inch))
    story.extend(H1("10. Settings"))
    A(table(["Tab", "What's in it"], [
        ["General", "Business name, industry, website, contact phone, brand colour and description."],
        ["Brand & Voice", "Tone of voice, voice guidelines, what you offer, your customers' pain points and your target audience. <b>The AI uses this to write in Kangrooo's voice</b> — keeping it accurate improves every post."],
        ["Usage", "An estimate of this month's usage and cost (AI images, videos, text). It's an estimate, not a bill."],
    ], [1.4, 5.1]))
    A(P("When you change something, a bar appears at the bottom to save your changes.", "muted"))
    A(CondPageBreak(3.2 * inch))

    # ---- 11. tasks ------------------------------------------------------------------
    story.extend(H1("11. Everyday tasks, step by step"))
    A(H2("Before you go Live (one time)"))
    A(steps([
        "<b>Connected Accounts</b>: TikTok, Instagram, Facebook and LinkedIn all show as connected, with your Facebook Page and LinkedIn company Page.",
        "<b>Settings › Brand & Voice</b>: your tone and audience are filled in and accurate.",
        "<b>Listings</b>: the venues you want promoted are active and have good photos.",
        "<b>Content Gallery</b>: you've reviewed some Testing content and you're happy with the quality.",
        "<b>Automation</b>: set small weekly frequencies, turn on <b>Automatic weekly runs</b>, then switch on <b>Live mode</b>.",
        "<b>Dashboard</b>: check the Needs attention box — it will tell you if anything is missing (for example an account that isn't connected).",
    ]))
    A(H2("Your weekly routine (about 10 minutes)"))
    A(bullets([
        "<b>Saturday</b>: open the Content Gallery and look over the week's new content and its planned times. In Live mode it is already scheduled; if something shouldn't go out, pause Generation in Automation (this holds everything) and contact your Kinetix support contact.",
        "<b>A couple of times a week</b>: glance at the Dashboard. Fix anything in Needs attention, and check <b>Recently published</b>.",
        "<b>When venues change</b>: add new listings, or switch off ones that are no longer available.",
    ]))
    A(H2("Pausing everything"))
    A(P("Go to <b>Automation</b> and switch <b>Generation</b> to paused (or switch back to Testing). Anything waiting to be published is held. Switch back when you're ready; held items go out at their times, or right away if the time has passed (social posts more than 6 hours late are skipped instead)."))
    A(H2("Making extra content this week"))
    A(P("In Live mode, use <b>Generate now</b> in the Content Gallery. The new items are published within the next 7 days, at times the AI picks."))
    A(H2("Posting something yourself"))
    A(P("Use <b>Posts › Create Post</b> (section 8). Your own posts don't affect the automatic content."))
    A(CondPageBreak(3.2 * inch))

    # ---- 12. troubleshooting -------------------------------------------------------
    story.extend(H1("12. When something goes wrong", "Most problems show up in the Dashboard's Needs attention box. Find the message below."))
    A(P("Messages that end with <b>\"Latest error: …\"</b> include the exact reason from the service involved — it usually points straight to the cause. "
        "Where a fix needs access to an outside account (Kie, OpenAI, Upload-Post, WordPress), the person who manages that account should do it; if that isn't you, forward them this page."))

    A(H2("Content isn't being created"))
    A(trouble([
        ["\"N creatives failed to generate\" — latest error mentions <b>credits</b>, <b>balance</b>, <b>insufficient</b>, or <b>Kie API Error</b>",
         "The AI image/video service (Kie) has run out of credits.",
         f"Top up credits at {link('https://kie.ai/billing', 'kie.ai/billing')}. You can see what used them at {link('https://kie.ai/logs', 'kie.ai/logs')}. Then open the failed items in the Content Gallery and click <b>Regenerate</b>, or use <b>Generate now</b>."],
        ["Latest error mentions <b>quota</b>, <b>429</b>, <b>billing</b> or <b>OpenAI</b>",
         "The AI writing service (OpenAI) has run out of credit or hit its limit.",
         f"Add credit at {link('https://platform.openai.com/settings/organization/billing/overview', 'platform.openai.com › Settings › Billing')}. Then Regenerate the failed items."],
        ["Latest error mentions <b>copyright</b> or <b>content security audit</b>",
         "The video service refused a video because a listing photo shows something like a cartoon character or brand.",
         "Kinetix already tries cleaner versions of the photos first. If it still fails, use <b>Generate now</b> to make an image post instead (regenerating keeps it a video), or ask support to remove that photo from the listing."],
        ["Latest error mentions <b>file type not supported</b> or <b>can't read one of the listing photos</b>",
         "One of the listing's photos is in a format the AI can't open.",
         "Ask support to replace the photo, or re-add the listing with JPEG/PNG photos."],
        ["\"no eligible property\"", "There's no active listing with usable photos left to feature.",
         "In <b>Listings</b>, switch listings back into rotation or add new ones with photos."],
        ["\"Generation has stalled\" or \"The weekly run … didn't create next week's content\"",
         "The background service that creates content didn't run.",
         "Contact your Kinetix support contact. In the meantime you can use <b>Generate now</b>."],
        ["<b>Generate now</b> button is greyed out", "Automation is paused, or you're in Live mode without owner/admin access.",
         "Turn on Generation in <b>Automation</b>, or ask an owner/admin."],
        ["\"this week already has the maximum of 14 … creatives\"", "There's a limit of 14 per type per week.", "Wait until next week, or use another content type."],
    ]))

    A(CondPageBreak(2.5 * inch))
    A(H2("Posts aren't going out"))
    A(trouble([
        ["\"TikTok / Instagram / Facebook / LinkedIn isn't connected\" or \"N scheduled posts can't publish because … isn't connected\"",
         "That social account is disconnected (for example the password changed or access expired).",
         f"Reconnect it on {link('https://app.upload-post.com/manage-users', 'Upload-Post')}, then open <b>Connected Accounts</b>. Do it before the post's time — posts more than 6 hours late are skipped."],
        ["\"Facebook / LinkedIn has no page selected\"",
         "Kinetix only posts to your Facebook Page and LinkedIn company Page, never to a personal profile.",
         f"Connect the Page on {link('https://app.upload-post.com/manage-users', 'Upload-Post')}, open <b>Connected Accounts</b>, then <b>Retry</b> the failed posts in the Content Gallery."],
        ["\"N automation posts failed to publish\"",
         "A platform refused the post. The latest error says why (for example a problem with the account or the media).",
         "Open the item in the Content Gallery › <b>Publishing</b>, fix the cause if needed, and click <b>Retry</b>."],
        ["\"N posts may or may not have gone out\" (Unconfirmed)",
         "The platform didn't confirm whether the post went out. Kinetix won't resend it automatically, to avoid duplicates.",
         "Check the account. In the Content Gallery click <b>It's live</b> or <b>It didn't post</b> (then Retry)."],
        ["\"N automation posts were skipped\" — latest error starts with \"missed the 6 hours publishing window\"",
         "The post couldn't go out within 6 hours of its time. The rest of the message says why: no connected account, listing deactivated, automation paused, or the publisher didn't run.",
         "Fix the reason so it doesn't happen again. Skipped posts aren't resent; use <b>Generate now</b> if you want a replacement."],
        ["\"… more than 30 minutes past their time … the publisher may not be running\"",
         "Posts are due but the background publisher hasn't sent them.",
         "Contact your Kinetix support contact."],
        ["\"Upload-Post isn't configured\"", "Kinetix's connection to Upload-Post isn't set up.", "Contact your Kinetix support contact."],
        ["\"Live creatives have platforms with no post\"",
         "When the content was made, that platform had no connected account, or its planned time had already passed by more than a day.",
         "Connect the account (it's then scheduled automatically within 15 minutes, if its time hasn't passed)."],
    ]))

    A(CondPageBreak(2.5 * inch))
    A(H2("Blogs aren't appearing on the website"))
    A(trouble([
        ["\"N blogs failed to publish to WordPress\" — latest error has <b>(401)</b>",
         "Kinetix's password for the blog was removed or changed.",
         f"A blog admin creates a new <b>Application Password</b> at {link('https://blog.kangrooo.ca/wp-admin/profile.php', 'blog.kangrooo.ca › Users › Profile')} (near the bottom of the page) and sends it to your Kinetix support contact. Then click <b>Retry</b> on the blog."],
        ["Latest error has <b>(403)</b> or \"not allowed\"",
         "The blog user Kinetix uses doesn't have permission to publish.",
         "On the blog, give that user the Administrator or Editor role, then Retry."],
        ["\"WordPress isn't configured\"", "Kinetix's connection to the blog isn't set up.", "Contact your Kinetix support contact."],
        ["\"… blogs are more than 30 minutes past their publish time\"", "The background publisher didn't run.", "Contact your Kinetix support contact."],
        ["Blog shows <b>On hold</b>", "Automation is paused or in Testing.", "Resume / switch to Live; it's published at its time (or right away if that has passed)."],
    ]))

    A(CondPageBreak(2.5 * inch))
    A(H2("Your own posts (Posts page)"))
    A(trouble([
        ["\"Upload-Post didn't confirm … It may have posted\"", "There was no answer from the platform, so it's unclear whether the post went out.",
         "Check the account <b>before</b> clicking Retry, so it isn't posted twice."],
        ["\"Not cancelled — it will still be posted at its time\"", "The scheduled post couldn't be cancelled.",
         f"Cancel it directly on {link('https://app.upload-post.com', 'Upload-Post')}, or try again in a minute."],
        ["\"Social posts have been publishing for over 15 minutes\" / \"weren't confirmed after their time\"",
         "The platform hasn't confirmed the result.", "Check the account. If the problem continues, contact your Kinetix support contact."],
        ["\"The scheduled time has already passed\"", "You picked a time in the past.", "Pick a future time."],
    ]))

    A(CondPageBreak(2 * inch))
    A(H2("Dashboard numbers"))
    A(trouble([
        ["\"Couldn't load account analytics / impressions from Upload-Post\"", "The analytics service didn't answer this time.",
         f"Refresh in a few minutes. If it keeps happening, check your plan on {link('https://www.upload-post.com/pricing/', 'Upload-Post')} or contact support."],
        ["Numbers show <b>—</b>", "No account is connected, or the platform hasn't reported data yet.", "Connect accounts; new accounts can take a day to show numbers."],
    ]))
    A(callout("info", "Still stuck?", "Send your Kinetix support contact a screenshot of the Needs attention box (including the \"Latest error\" line) — it contains everything needed to find the cause."))
    A(CondPageBreak(3.2 * inch))

    # ---- 13. good to know ----------------------------------------------------------
    story.extend(H1("13. Good to know"))
    faqs = [
        ("Can I change a post before it goes out?", "In Testing, yes — open it in the Content Gallery and <b>Regenerate</b> it, with a note for the AI if you like. In Live mode each item is scheduled the moment it's ready and is then locked; to stop something going out, pause Generation in Automation and contact your Kinetix support contact."),
        ("Can I stop everything quickly?", "Yes. In <b>Automation</b>, pause Generation (or switch to Testing). Anything waiting is put on hold."),
        ("Who chooses the posting times?", "The AI, based on general patterns for each platform (e.g. weekday mornings for LinkedIn and blogs, evenings for social). Posts on the same platform are spread out across the week."),
        ("Does the AI make things up?", "It's instructed not to. It only describes what's in the listing details and photos, never invents prices, capacity or reviews, and its work is checked before anything is accepted."),
        ("Why does a video have a logo and end card?", "Every video carries the Kangrooo logo and ends on a one-second Kangrooo card, so your brand is always visible."),
        ("What's the difference between the Content Gallery and Posts?", "The Content Gallery is the automatic, AI-made content about your listings. Posts is for your own one-off social posts."),
        ("Can I post the same content twice by accident?", "No. Kinetix checks before every post and refuses to send something that's already been sent."),
        ("What happens to deleted listings?", "Listings are switched off rather than deleted, so their history is kept and they can be switched back on."),
        ("Where do I see costs?", "<b>Settings › Usage</b> shows an estimate. Actual bills come from the AI and posting services."),
    ]
    for q, a in faqs:
        A(KeepTogether([H3(q), P(a)]))
    A(Spacer(1, 10))
    A(H2("Useful links"))
    A(table(["What", "Link"], [
        ["Connect or reconnect social accounts (Upload-Post)", link("https://app.upload-post.com/manage-users", "app.upload-post.com/manage-users")],
        ["Upload-Post plans", link("https://www.upload-post.com/pricing/", "upload-post.com/pricing")],
        ["Top up AI image/video credits (Kie)", link("https://kie.ai/billing", "kie.ai/billing")],
        ["See AI image/video usage (Kie)", link("https://kie.ai/logs", "kie.ai/logs")],
        ["Add AI writing credit (OpenAI)", link("https://platform.openai.com/settings/organization/billing/overview", "platform.openai.com — Billing")],
        ["The Kangrooo blog", link("https://blog.kangrooo.ca", "blog.kangrooo.ca")],
        ["Blog admin — Application Passwords", link("https://blog.kangrooo.ca/wp-admin/profile.php", "blog.kangrooo.ca/wp-admin/profile.php")],
    ], [3.3, 3.2]))

    doc.build(story)

if __name__ == "__main__":
    build(sys.argv[1])
