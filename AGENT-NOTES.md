# AGENT-NOTES — design history and incidents behind fantasy-web's CLAUDE.md

Why the rules in `CLAUDE.md` read the way they do. On-demand context: read the
relevant section when something seems odd or is about to be relitigated, not by
default — this file was split off so it stops riding in every request.

## Draft-start: the shape the picker settled on

The three kinds of source were tabs (#406), then all three lists at once with a
button per row (#459, #503), then a hierarchy of filled and outlined buttons
(#505). Eight buttons on one page was still too much; folding two kinds behind
tiles that name their contents is the compromise. The boards were once folded
into a `<select>` (#508, #514) — the page's own invention, and it made the
reader learn the question twice. When the choices under the tiles became cards
too (#515) the two rows looked alike and nothing said which was the category,
so the category went low and the cards kept the weight. The presets were cards
and the boards a ruled list for one release (#514); switching tiles then
switched the grammar of the control under them, which read as inconsistent, so
the card won. The AI projection second in a vertical list read as a footnote —
that is why the two presets are side by side as peers.

## Why "locked is not hidden"

Someone who cannot see the thing has no reason to buy it. The card keeps its
place and full weight; only the gold edge and padlock say it is not yours.

## Why a draft is a row of its own

Before `kind: draft` existed, a draft was a field on the board, so "one draft
per projection" was a property of the storage rather than anyone's decision,
and a preset could be "used up" by the draft against it.

## The hidden-departed-rows call

Nearly everyone who leaves a player pool is a player no fantasy manager would
draft, so a count of them was noise (Alexander's call) — the pool sync never
removes rows, and the table silently hides the departed. Likewise a league-sync
draft name is declined once the user has named the draft: a name somebody chose
is the more deliberate of the two.

## Shared pages and copies

The shared-projection page used to catch the copy-name 409 and answer "you
already have a copy of this board", with links to go and find it — which left
someone who had pressed a button on a board doing the navigating themselves.
Now db-service numbers the new copy instead. On the premium side there was a
second page, `/account`, that carried the subscription half: it said what the
cards already said, and a free account that reached it was told it had no
subscription and sent to the pricing page anyway — hence the redirects to
`/premium` (as `RedirectFunction`s, so an old checkout's
`/account?checkout=success` still lands right).

## The home page

It began as a two-step checklist, which Alexander took out for telling everyone
there was one right order.

## The timeout interceptor

A server that accepts the connection and never answers raises no error of its
own: staging's BFF deadlocked on 2026-09-11 and pages sat on their spinner for
minutes. Hence `timeoutInterceptor` (20 s read / 60 s write) and
`RequestTimeoutError` not being retried.

## The pinned-table-header on iOS

The page is scrolled by a thread the page's code never runs on. Sticky cannot
reach past the horizontal scroll container, and WebKit resolves a scroll-driven
animation on the main thread (`canBeAccelerated()` refuses progress-based
timelines without threaded animations, and the build that had them still showed
it). Whatever moves the header during a flick trails the rows by however far the
scroll got ahead — the header part-way down the table that was reported — hence
the follow/hide/settle behaviour. The `<thead>` stays `position: sticky` even
though it pins nothing: made merely `relative` (#530), the sticky rank and name
cells were placed at the group's untransformed spot and the pinned header came
back with nothing where the rank and the name belong. `will-change` was in the
mix when the cells went missing (#531) and buys nothing where the animation is
composited anyway.

## The icon guard

The app once held 61 hand-drawn inline SVGs with six stroke widths and three
icon families mixed, refresh and the check each drawn three ways, and a dozen
typed characters standing in for icons on the same rows as real ones. None of
it broke anything, which is why it accumulated for a year — hence
`check-inline-icons.sh`.

## The Sentry integration's origin

A user lost a saved projection on 2026-08-13 and the only reason anyone found
out was an emailed photograph of their screen a day later. The four backend
services had reported to Sentry for months; the browser reported nowhere.

## The E2E schedule

The suite used to run on every merge to `master` too; that was traded away
because each run installs a Chromium and waits out the redeploy, and merges land
several times a day. The `e2e-red` issue exists because the suite once
reproduced a data-loss bug nightly for five days and the only trace was a red
cross nobody read.
