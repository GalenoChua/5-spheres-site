# Posts live here, as markdown

One file per post. `scripts/build_blog.py` renders them into the site.

    python scripts/new_post.py "A title"            start an English post
    python scripts/new_post.py "Tytul" --lang pl    start a Polish one
    python scripts/build_blog.py                    render everything

    content/field-notes/en/<slug>.md  ->  /field-notes/<slug>/
    content/field-notes/pl/<slug>.md  ->  /pl/notatki/<slug>/

## Front matter

| key | |
|---|---|
| `title` | the `<title>` and the social card |
| `heading` | the `<h1>`, if it should differ from `title` |
| `description` | one sentence. The meta description Google shows, and the standfirst under the headline |
| `kicker` | the small label above the headline |
| `date` | publication date, `YYYY-MM-DD` |
| `updated` | last substantive change. Defaults to `date` |
| `lang` | `en` or `pl` |
| `slug` | the URL segment |
| `translation` | the slug of this post in the other language |

`translation` has to name a file that exists. It writes the `hreflang` pair that
tells Google these are the same piece in two languages, and pointing at a
counterpart that is not there is worse than saying nothing.

## The body

Markdown. Paragraphs, `##` and `###`, `**bold**`, `*italic*`, lists, `>` quotes
and links all render into the site's own styles.

**Raw HTML blocks pass through**, so the CTA bars the existing posts use still
work. Leave a blank line above and below:

    <div class="openbar" style="margin-top: 30px;">
      <a class="btn" href="/coaching/">See the coaching page &#8594;</a>
    </div>

## Before you publish

    python "%USERPROFILE%\.claude\brain\voice\voicepass.py" content/field-notes/en/<slug>.md
    python scripts/build_blog.py
    python scripts/check_site.py

The six posts written before this existed are still hand-written HTML under
`field-notes/`. They are not migrated on purpose: re-rendering pages that work
to prove a point is a bad trade. The index and the sitemap scan the rendered
HTML, so old and new posts appear on the same footing.
