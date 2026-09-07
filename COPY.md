# Every word SlapStat shows a user

An inventory of the copy in `fantasy-web`, plus the text the backend writes that a reader
still ends up seeing. Headings, buttons, labels, placeholders, tooltips, empty states, error
messages, screen-reader labels, the legal pages, and the browser tab.

It exists so the copy can be read as copy — in one place, in the order someone meets it —
rather than hunted through 69 templates. Use it to review tone, to catch a message that
contradicts another, or to check the house rules before a release.

## How to read this

Sections follow the site, roughly in the order a new user walks it. Each section says where
it is and which files feed it; each row is one string and the element it renders in.

- **`{{ ... }}`** is a value the app fills in at runtime. Rows marked *filled in at runtime*
  have no fixed wording at all — something computed renders there.
- **`${...}`** is the same thing in a string written in TypeScript.
- **Screen-reader label** is text nobody sees. It is still copy: it is what a screen reader
  reads aloud, and it is the only name some icon buttons have.
- **In code** means the string lives in a `.ts` file rather than a template. Toasts, error
  messages and the lists that build menus are all like this.
- A string appearing twice appears twice here. Where two pages say the same thing in
  different words, that is worth knowing, so nothing is deduplicated.

## House rules this copy is held to

From the monorepo's `CLAUDE.md`, and worth checking against when reviewing:

- **No em dashes** in anything a user reads. Use a comma, a colon, parentheses, or two
  sentences. An en dash in a numeric range (`3–20 characters`) is typography, not
  punctuation, and stays. So does a dash standing in for an empty table cell.
- **Never tell someone to retry something that cannot succeed.** Payment and premium
  failures say what did *not* happen instead.
- **Say what is true at that moment.** The account page's confirming state exists because
  the page once called a paying customer's account free.

## Keeping it current

The strings were pulled out of the templates and the TypeScript mechanically, then grouped
and annotated by hand. No generator is checked in: the extraction is the easy half and the
grouping is the half with judgement in it, so a script in the repo would look more
authoritative than it is. Expect this to drift as pages change. It is a snapshot with a date
on it, not the source of truth. The source is the source.

**Snapshot taken:** 7 September 2026, against `fantasy-web` at `2fb9218`, `fantasy-bff` at
`f5895e9`.

**Not included:** commit messages, code comments, console logs, Swagger and OpenAPI
descriptions (developer-facing), and the mock payment provider's dev-only pages.

## What is in here

- [The browser tab and the crawler](#the-browser-tab-and-the-crawler)
- [The shell, on every signed-in page](#the-shell-on-every-signed-in-page)
- [Landing page — `/`](#landing-page--)
- [Signing in and account creation — `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/auth/google/callback`](#signing-in-and-account-creation--login-register-forgot-password-reset-password-verify-email-authgooglecallback)
- [My projections — `/projections`](#my-projections--projections)
- [New projection — `/projections/new`](#new-projection--projectionsnew)
- [The projection editor — `/projections/:id`](#the-projection-editor--projectionsid)
- [League sync — inside the editor and Who's hot](#league-sync--inside-the-editor-and-whos-hot)
- [Stat names, tooltips and warnings — wherever a table is drawn](#stat-names-tooltips-and-warnings--wherever-a-table-is-drawn)
- [Draft mode — `/draft` and `/projections/:id/draft`](#draft-mode--draft-and-projectionsiddraft)
- [Who's hot — `/whos-hot`](#whos-hot--whos-hot)
- [A shared projection — `/s/:token`](#a-shared-projection--stoken)
- [Premium — `/pricing`, `/pay`, `/account`](#premium--pricing-pay-account)
- [Profile — `/profile`](#profile--profile)
- [Legal — `/privacy`, `/terms`, `/refunds`](#legal--privacy-terms-refunds)
- [Admin — `/admin`](#admin--admin)
- [Appendix A — text the server writes that a reader sees](#appendix-a--text-the-server-writes-that-a-reader-sees)
- [Appendix B — what is missing, and where to look next](#appendix-b--what-is-missing-and-where-to-look-next)

## The browser tab and the crawler

What a browser tab, a bookmark and a search result show. Set once in `index.html`; the share pages override it from the server (see Appendix A).


**`src/index.html`**

| Text | Where |
| --- | --- |
| SlapStat - Top-Shelf Tools for Fantasy Hockey Managers | page title |
| width=device-width, initial-scale=1 | meta content on `<meta>` |
| Top-shelf tools for fantasy hockey managers: rankings and projections tuned to your league's scoring settings. Connect your Yahoo league and play smarter. | meta content on `<meta>` |
| SlapStat - Top-Shelf Tools for Fantasy Hockey Managers | meta content on `<meta>` |
| Top-shelf tools for fantasy hockey managers: rankings and projections tuned to your league's scoring settings. Connect your Yahoo league and play smarter. | meta content on `<meta>` |
| SlapStat - top-shelf tools for fantasy hockey managers | meta content on `<meta>` |
| SlapStat - Top-Shelf Tools for Fantasy Hockey Managers | meta content on `<meta>` |
| Top-shelf tools for fantasy hockey managers: rankings and projections tuned to your league's scoring settings. Connect your Yahoo league and play smarter. | meta content on `<meta>` |

## The shell, on every signed-in page

The bar across the top, the menus behind it, the footer at the bottom, and the banners and toasts that can appear over any page.


**`src/app/app.html`**

| Text | Where |
| --- | --- |
| SlapStat home | screen-reader label on `<a>` |
| SlapStat | image alt text on `<img>` |
| Menu | screen-reader label on `<button>` |
| Draft | button |
| Who's hot | link |
| Premium | link |
| Admin | link |
| Account menu | screen-reader label on `<button>` |
| Sign in | link |
| Draft mode | link |
| My projections | link |
| Who's hot | link |
| Premium | link |
| Admin | link |
| {{ username }} | inline text, filled in at runtime |
| Set a username | link |
| {{ account.email() }} | inline text, filled in at runtime |
| Premium | inline text |
| Free plan | inline text |
| Profile | link |
| Get Premium | link |
| Subscription | link |
| Sign out | button |

**`src/app/shared/site-footer/site-footer.html`**

| Text | Where |
| --- | --- |
| SlapStat | image alt text on `<img>` |
| © 2026 SlapStat · Top-Shelf Tools for Fantasy Hockey Managers. | inline text |
| info@slapstat.com | link |
| Pricing | link |
| Privacy | link |
| Terms | link |
| Refunds | link |
| Sign in | link |
| Get started | link |

**`src/app/shared/environment-banner/environment-banner.html`**

| Text | Where |
| --- | --- |
| {{ label() }} | button, filled in at runtime |
| Service versions | screen-reader label on `<div>` |
| Loading versions… | paragraph |
| Could not load versions | paragraph |
| {{ service.name }} | inline text, filled in at runtime |
| {{ service.version ?? '—' }} | inline text, filled in at runtime |

**`src/app/shared/unverified-banner/unverified-banner.html`**

| Text | Where |
| --- | --- |
| Verification email sent. Check your inbox (and your spam folder). | inline text |
| Please verify your email to secure your account. | inline text |
| Sending | inline text |
| Resend email | button |
| Couldn't send. Please try again. | inline text |

**`src/app/shared/consent-banner/consent-banner.html`**

| Text | Where |
| --- | --- |
| Cookie consent | screen-reader label on `<div>` |
| We use cookies to understand how SlapStat is used, so we can make it better. Decline and we'll still count the visit, but without cookies and without tying it to you. See our privacy policy. | paragraph |
| Decline | button |
| Accept | button |

**`src/app/shared/toast/toast.html`**

| Text | Where |
| --- | --- |
| {{ notification.message }} | inline text, filled in at runtime |
| Dismiss | screen-reader label on `<button>` |

**`src/app/shared/error-state/error-state.html`**

| Text | Where |
| --- | --- |
| {{ title() }} | paragraph, filled in at runtime |
| {{ message() }} | paragraph, filled in at runtime |
| Try again | button |

**`src/app/shared/error-state/error-state.ts`**

| Text | Where |
| --- | --- |
| Something went wrong | in code |
| Check your connection and try again. | in code |

**`src/app/shared/http-error.ts`**

| Text | Where |
| --- | --- |
| We can't reach the server right now. Please try again in a moment. | in code |

**`src/app/shared/navigation-error.ts`**

| Text | Where |
| --- | --- |
| Couldn't load that page. Please refresh. A new version may have just been released. | in code |
| Couldn't open that page. Please try again. | in code |

**`src/app/shared/popover/popover-trigger.directive.ts`**

| Text | Where |
| --- | --- |
| Menu | in code |

**`src/app/shared/tooltip/tooltip.ts`**

| Text | Where |
| --- | --- |
| {{ text() }} | in code |

**`src/app/pipes/relative-time.pipe.ts`**

| Text | Where |
| --- | --- |
| just now | in code |

## Landing page — `/`

The only page a signed-out visitor lands on. Has its own header and footer, not the shell's.


**`src/app/landing/landing.html`**

| Text | Where |
| --- | --- |
| SlapStat home | screen-reader label on `<a>` |
| SlapStat | image alt text on `<img>` |
| Pricing | link |
| Sign in | link |
| Get started | link |
| Prepare for the upcoming | heading (h1) |
| NHL fantasy season. | heading (h1) |
| Create a projection tailored to your league, with every player ranked to your exact scoring settings. Try the editor right here, no account needed. | paragraph |
| Get started, it's free | link |
| Sign in | link |
| {{ feature.title }} | heading (h3), filled in at runtime |
| {{ feature.description }} | paragraph, filled in at runtime |
| Get your draft board ready. | heading (h2) |
| Create a free account to save your projections and take them to draft day. | paragraph |
| Get started | link |

**`src/app/landing/landing.ts`**

| Text | Where |
| --- | --- |
| Ditch the Excel Sheets | in code |
| Tailor projections directly to your league settings, whether you play points or categories. No more manual formulas or messy spreadsheets. | in code |
| Category Scoring, Solved | in code |
| Comparing player value in category leagues used to be guesswork. Our Z-Score ranking combines all your league's categories into a single, easy-to-read board. | in code |
| Built for Draft Day | in code |
| Run your draft in real-time with an interactive draft board, track picks seamlessly, and see instant post-draft power rankings to compare every team. | in code |

**`src/app/landing/landing-demo/landing-demo.html`**

| Text | Where |
| --- | --- |
| Couldn't load the demo | browser tooltip on `<app-error-state>` |
| We couldn't load the player data. Check your connection and try again. | message on `<app-error-state>` |
| Save projection | button |
| Sign in to import your ' + syncablePlatforms + ' league scoring and roster | tooltip on `<a>` |
| Import league | link |

**`src/app/landing/landing-demo/landing-demo.ts`**

| Text | Where |
| --- | --- |
| Yahoo | in code |

## Signing in and account creation — `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/auth/google/callback`

The shared `auth-form` carries the fields and their validation; each page adds its own heading and its own failure messages.


**`src/app/auth/login/login.html`**

| Text | Where |
| --- | --- |
| Sign in | browser tooltip on `<app-auth-form>` |

**`src/app/auth/login/login.ts`**

| Text | Where |
| --- | --- |
| Invalid email or password. Please try again. | in code |
| Facebook sign-in failed. Please try again. | in code |

**`src/app/auth/register/register.html`**

| Text | Where |
| --- | --- |
| Create account | browser tooltip on `<app-auth-form>` |

**`src/app/auth/register/register.ts`**

| Text | Where |
| --- | --- |
| Registration failed. Please check your details and try again. | in code |
| Facebook sign-in failed. Please try again. | in code |

**`src/app/auth/auth-form/auth-form.html`**

| Text | Where |
| --- | --- |
| {{ title() }} | heading (h1), filled in at runtime |
| {{ subtitle() }} | paragraph, filled in at runtime |
| Email | field label |
| you@example.com | placeholder on `<input>` |
| {{ error.message }} | inline text, filled in at runtime |
| Password | field label |
| {{ error.message }} | inline text, filled in at runtime |
| Confirm password | field label |
| {{ error.message }} | inline text, filled in at runtime |
| Forgot password? | link |
| {{ errorMessage() }} | div, filled in at runtime |
| {{ loadingLabel() }} | inline text, filled in at runtime |
| {{ submitLabel() }} | button, filled in at runtime |
| or | inline text |
| {{ footerText() }} {{ footerLinkLabel() }} | paragraph |

**`src/app/auth/auth-form/auth-form.ts`**

| Text | Where |
| --- | --- |
| Email is required. | in code |
| Enter a valid email address. | in code |
| Email is too long. | in code |
| Password is required. | in code |
| Password must be at most 72 characters. | in code |
| Password does not meet the requirements below. | in code |
| Please confirm your password. | in code |
| Passwords do not match. | in code |

**`src/app/auth/password-requirements/password-requirements.html`**

| Text | Where |
| --- | --- |
| Your password must contain: | paragraph |
| {{ requirement.met ? '✓' : '○' }} | inline text, filled in at runtime |
| {{ requirement.label }} | inline text, filled in at runtime |
| {{ requirement.met ? '(done)' : '(not yet)' }} | inline text, filled in at runtime |
| {{ metCount() }} of {{ requirements().length }} password requirements met | paragraph |

**`src/app/auth/password-policy.ts`**

| Text | Where |
| --- | --- |
| At least ${PASSWORD_MIN_LENGTH} characters | in code |
| An uppercase letter (A-Z) | in code |
| A lowercase letter (a-z) | in code |
| A number (0-9) | in code |

**`src/app/auth/forgot-password/forgot-password.html`**

| Text | Where |
| --- | --- |
| Check your email | heading (h1) |
| If an account exists for that address, we've sent a link to reset your password. The link expires in 30 minutes. | paragraph |
| Back to sign in | paragraph |
| Forgot password? | heading (h1) |
| Enter your email and we'll send you a reset link. | paragraph |
| Email | field label |
| you@example.com | placeholder on `<input>` |
| {{ error.message }} | inline text, filled in at runtime |
| {{ errorMessage() }} | div, filled in at runtime |
| Sending link | inline text |
| Send reset link | button |
| Know your password? Sign in | paragraph |

**`src/app/auth/forgot-password/forgot-password.ts`**

| Text | Where |
| --- | --- |
| Email is required. | in code |
| Enter a valid email address. | in code |
| Email is too long. | in code |
| Something went wrong. Please try again. | in code |

**`src/app/auth/reset-password/reset-password.html`**

| Text | Where |
| --- | --- |
| Password updated | heading (h1) |
| Your password has been reset. You can now sign in with your new password. | paragraph |
| Go to sign in | link |
| Invalid link | heading (h1) |
| This password reset link is missing or invalid. | paragraph |
| Request a new reset link | link |
| Set a new password | heading (h1) |
| Choose a new password for your account. | paragraph |
| New password | field label |
| {{ error.message }} | inline text, filled in at runtime |
| Confirm password | field label |
| {{ error.message }} | inline text, filled in at runtime |
| {{ errorMessage() }} | div, filled in at runtime |
| Resetting | inline text |
| Reset password | button |
| Back to sign in | paragraph |

**`src/app/auth/reset-password/reset-password.ts`**

| Text | Where |
| --- | --- |
| Password is required. | in code |
| Password must be at most 72 characters. | in code |
| Password does not meet the requirements below. | in code |
| Please confirm your password. | in code |
| Passwords do not match. | in code |
| This reset link is invalid or has expired. Please request a new one. | in code |

**`src/app/auth/verify-email/verify-email.html`**

| Text | Where |
| --- | --- |
| Verifying your email | heading (h1) |
| One moment while we confirm your email address | paragraph |
| Email verified | heading (h1) |
| Thanks, your email address is confirmed. You're all set. | paragraph |
| Go to your projections | link |
| Verification failed | heading (h1) |
| This verification link is invalid or has expired. Sign in and use the banner to send a fresh one. | paragraph |
| Go to sign in | link |
| Invalid link | heading (h1) |
| This verification link is missing or invalid. | paragraph |
| Back to sign in | link |

**`src/app/auth/google-sign-in-button/google-sign-in-button.html`**

| Text | Where |
| --- | --- |
| Continue with Google | inline text |

**`src/app/auth/google-callback/google-callback.html`**

| Text | Where |
| --- | --- |
| Sign-in failed | heading (h1) |
| {{ errorMessage() }} | paragraph, filled in at runtime |
| Back to sign in | link |
| Signing you in | heading (h1) |
| One moment while we finish signing you in with Google | paragraph |

**`src/app/auth/google-callback/google-callback.ts`**

| Text | Where |
| --- | --- |
| Google sign-in was cancelled. You can try again or use your email and password. | in code |
| Google sign-in failed. Please try again. | in code |
| Google sign-in failed. Please try again. | in code |

**`src/app/auth/facebook-sign-in-button/facebook-sign-in-button.html`**

| Text | Where |
| --- | --- |
| Continue with Facebook | button |

**`src/app/auth/facebook-sign-in-button/facebook-sign-in-button.ts`**

| Text | Where |
| --- | --- |
| Failed to load the Facebook SDK | in code |

**`src/app/services/auth.service.ts`**

| Text | Where |
| --- | --- |
| Google sign-in could not be verified. Please try again. | in code |

## My projections — `/projections`

The list of saved boards, one card each, reached from the Draft menu.


**`src/app/projection-list/projection-list.html`**

| Text | Where |
| --- | --- |
| My projections | heading (h1) |
| Create a new projection or pick one to keep editing. | paragraph |
| + Create new projection | button |
| Couldn't load your projections | browser tooltip on `<app-error-state>` |
| No projections yet | paragraph |
| Create your first projection to start ranking players for your league. | paragraph |

**`src/app/projection-list/projection-list.ts`**

| Text | Where |
| --- | --- |
| Couldn't save your projection from the demo. Please try again. | in code |
| Couldn't open sharing for this projection. Please try again. | in code |
| Couldn't discard the draft. Please try again. | in code |
| Couldn't delete the projection. Please try again. | in code |

**`src/app/projection-list/projection-card/projection-card.html`**

| Text | Where |
| --- | --- |
| {{ projection().name }} | inline text, filled in at runtime |
| From {{ from.authorUsername }} · | inline text |
| Updated {{ projection().updatedAt \| relativeTime }} | inline text |
| Draft complete | inline text |
| Draft in progress | inline text |
| Discard the draft for “{{ projection().name }}”? | inline text |
| Yes, discard | button |
| Cancel | button |
| Delete “{{ projection().name }}”? | inline text |
| Yes, delete | button |
| Cancel | button |
| Edit | button |
| {{ draftLabel() }} | button, filled in at runtime |
| {{ isPreparingShare() ? 'Opening…' : 'Share' }} | button, filled in at runtime |
| Discard draft | button |
| Delete | button |

**`src/app/projection-list/projection-card/projection-card.ts`**

| Text | Where |
| --- | --- |
| View summary | in code |
| Resume draft | in code |
| Draft mode | in code |

## New projection — `/projections/new`

Naming a board and choosing what it starts from, with a live preview of the choice. The share-link importer here is the same component the draft picker uses.


**`src/app/projection-create/projection-create.html`**

| Text | Where |
| --- | --- |
| Couldn't load the page | browser tooltip on `<app-error-state>` |
| We couldn't load your player data. Check your connection and try again. | message on `<app-error-state>` |
| ← My projections | link |
| New projection | heading (h1) |
| Name | field label |
| Projection name | placeholder on `<input>` |
| You already have a projection with that name. Pick another one. | paragraph |
| Starting point | inline text |
| What the starting point decides | label input on `<app-help-tip>` |
| The initial stats each player is given. | text input on `<app-help-tip>` |
| {{ option.name }} | inline text, filled in at runtime |
| {{ kindCount(option.kind) }} | inline text, filled in at runtime |
| You have no projections yet. Start from a preset, and copies of it belong here. | paragraph |
| {{ projection.name }} | inline text, filled in at runtime |
| Updated {{ projection.updatedAt \| relativeTime }} | inline text |
| Nobody's board here yet. Paste a SlapStat share link below to copy one. | paragraph |
| {{ board.name }} | inline text, filled in at runtime |
| {{ sourceLabel(board) }} · imported {{ board.createdAt \| relativeTime }} | inline text |
| Or paste a share link | label input on `<app-share-import>` |
| {{ preset.name }} | inline text, filled in at runtime |
| Premium | inline text |
| Preview | inline text |
| What the preview shows | label input on `<app-help-tip>` |
| The first rows of the editor, as this starting point would fill them in. | text input on `<app-help-tip>` |
| Premium | inline text |
| The AI projection | heading (h3) |
| A model-built line for every player it can reach, from last season's numbers, ice time and workload. Start your board from it instead of from last season, then tune whatever you disagree with, exactly as you would any other projection. | paragraph |
| Every skater and goalie the model reaches, ranked to your own scoring settings | list item |
| Yours to edit: a starting point, not a locked board | list item |
| Draft against it straight from Draft mode | list item |
| Unlock with Premium | link |
| Loading preview… | paragraph |
| Starts as an exact copy of {{ board.name }}, with the numbers it was last saved with. | paragraph |
| There is nothing to copy here yet. | paragraph |
| Preview unavailable right now. | paragraph |
| The model has lines for {{ coverage.skaters }} skaters and {{ coverage.goalies }} goalies. Players it cannot reach (prospects yet to play, goalies it projects no starts for, and anyone it has no basis for) are left out, so this projection opens with fewer rows than the other starting points give. Data © MoneyPuck.com. | paragraph |
| {{ isCreating() ? 'Creating…' : 'Create projection' }} | button, filled in at runtime |

**`src/app/projection-create/projection-create.ts`**

| Text | Where |
| --- | --- |
| Last season's stats | in code |
| AI projection | in code |
| From scratch | in code |
| From ${projection.origin.authorUsername} | in code |
| Your projection | in code |
| Couldn't load the projection to copy. Please try again. | in code |
| You already have a projection with that name. | in code |
| Couldn't create the projection. Please try again. | in code |

**`src/app/models/source-kind.ts`**

| Text | Where |
| --- | --- |
| Preset | in code |
| Your projection | in code |
| Shared board | in code |

**`src/app/services/projection-name.ts`**

| Text | Where |
| --- | --- |
| My Projection | in code |
| My Projection | in code |
| My Projection ${suffix} | in code |
| My Projection ${suffix} | in code |

**`src/app/shared/share-import/share-import.html`**

| Text | Where |
| --- | --- |
| {{ label() }} | field label, filled in at runtime |
| Paste a share link | placeholder on `<input>` |
| Name this copy | placeholder on `<input>` |
| {{ isImporting() ? 'Importing…' : 'Import' }} | button, filled in at runtime |
| {{ importHint() }} | paragraph, filled in at runtime |

**`src/app/shared/share-import/share-import.ts`**

| Text | Where |
| --- | --- |
| Add a shared board | in code |
| That doesn't look like a SlapStat share link. | in code |
| Give the copy a name. | in code |
| You already have a board with that name. Give this copy another. | in code |
| That link isn't active any more. | in code |
| Couldn't import that board. Please try again. | in code |

## The projection editor — `/projections/:id`

The main working screen: settings at the top, then the player table. Its dialogs (share, full season, league sync, sync warning) and its menus all live here.


**`src/app/draft-projection/draft-projection.html`**

| Text | Where |
| --- | --- |
| Couldn't load player data | browser tooltip on `<app-error-state>` |
| A projection can't be shown without it. Check your connection and try again. | message on `<app-error-state>` |
| ← My projections | link |
| Projection name | screen-reader label on `<input>` |
| Save | button |
| Cancel | button |
| {{ renameError() }} | paragraph, filled in at runtime |
| Rename projection | tooltip on `<button>` |
| Rename projection | screen-reader label on `<button>` |
| {{ projectionName() }} | button, filled in at runtime |
| Share | button |
| {{ draftLinkLabel() }} | link, filled in at runtime |
| Imported from ' + leagueName + ' (click to re-sync or change league) | tooltip on `<button>` |
| Synced with {{ leagueName }} | inline text |
| Import league | button |

**`src/app/draft-projection/draft-projection.ts`**

| Text | Where |
| --- | --- |
| Draft mode | in code |
| View draft summary | in code |
| Resume draft | in code |
| Couldn't load player data. Please try again. | in code |
| Yahoo | in code |
| Could not re-sync from ${platform}. Try again. | in code |
| Couldn't open the projection. Please try again. | in code |
| Name cannot be empty. | in code |
| A projection with that name already exists. | in code |
| Could not rename the projection. | in code |

**`src/app/draft-projection/player-projections-table/player-projections-table.html`**

| Text | Where |
| --- | --- |
| Player projections | heading (h2) |
| Undo (Ctrl+Z) | tooltip on `<button>` |
| Undo last change | screen-reader label on `<button>` |
| Redo (Ctrl+Shift+Z) | tooltip on `<button>` |
| Redo change | screen-reader label on `<button>` |
| Saving… | inline text |
| Saved | inline text |
| Couldn't save, changes are unsaved | inline text |
| League type | screen-reader label on `<div>` |
| Points | button |
| Category | button |
| League setup | button |
| Stats | button |
| Search | field label |
| Search player… | placeholder on `<input>` |
| {{ changed }} {{ changed === 1 ? 'position' : 'positions' }} changed | inline text |
| Put every player back on their default positions | tooltip on `<button>` |
| Reset all positions | button |
| Rookies only | field label |
| {{ dropped }} {{ dropped === 1 ? 'player is' : 'players are' }} no longer in the league and hidden here. Your projected numbers for them are kept, and reappear if they return. | paragraph |
| This projection has no players. | paragraph |
| No players match your search. | paragraph |
| Showing {{ visibleProjections().length }} of {{ matchingCount() }} | inline text |
| Show more | button |

**`src/app/draft-projection/player-projections-table/player-projections-table.ts`**

| Text | Where |
| --- | --- |
| \|\| (key === | in code |

**`src/app/draft-projection/player-projections-table/projections-table-header/projections-table-header.html`**

| Text | Where |
| --- | --- |
| Player | table heading |
| {{ sortIndicator('name') }} | inline text, filled in at runtime |
| {{ sortIndicator(col) }} | inline text, filled in at runtime |
| {{ col \| statLabel }} | button, filled in at runtime |
| {{ col \| statLabel }} | inline text, filled in at runtime |
| Set every skater to a full 84-game season | tooltip on `<button>` |
| {{ sortIndicator(col) }} | inline text, filled in at runtime |
| {{ col \| statLabel }} | button, filled in at runtime |
| {{ col \| statLabel }} | inline text, filled in at runtime |
| {{ sortIndicator('summary') }} | inline text, filled in at runtime |
| {{ summaryLabel() }} | table heading, filled in at runtime |
| Stat weights (pts) | inline text |
| Decimals | inline text |
| {{ fullNameOf(col) }} | paragraph, filled in at runtime |
| Set a full 84-game season | button |
| Decimals | field label |
| Auto-scale scoring stats | field label |
| What auto-scaling does | label input on `<app-help-tip>` |
| Scale the selected scoring stats proportionally when ' +
              (col \| statLabel) +
              ' is edited. | text input on `<app-help-tip>` |
| Stats to scale | button |
| {{ scaledStatSummary(col) }} | inline text, filled in at runtime |
| {{ statKey \| statLabel }} | field label, filled in at runtime |
| Remove column | button |

**`src/app/draft-projection/player-projections-table/projections-table-header/projections-table-header.ts`**

| Text | Where |
| --- | --- |
| Total Points | in code |
| Z-Score | in code |
| ${name}. A Utility Stat that can be used to scale and project other stats. | in code |
| ${name}, games within ${scope}. A Utility Stat: it takes no weight and adds nothing to the total. | in code |
| ${name}. A Utility Stat: it takes no weight and adds nothing to the total. | in code |
| ${selected.length} of ${scalable.length} | in code |

**`src/app/draft-projection/player-projections-table/player-row/player-row.html`**

| Text | Where |
| --- | --- |
| {{ rank() }} | table cell, filled in at runtime |
| {{ player().name }} | inline text, filled in at runtime |
| ({{ playerPosition() }}) | button |
| ({{ playerPosition() }}) | inline text |
| Rookie this season | tooltip on `<span>` |
| R | inline text |
| {{ injuryLabel() }} | inline text, filled in at runtime |
| {{ player().teamAbbrev }} | inline text, filled in at runtime |
| Projected for fewer games than the league's goalie minimum, so this goalie is ranked last. | tooltip on `<span>` |
| Below min. games | inline text |
| {{ (scoringType() === 'category' ? playerScore().zScore : playerScore().fantasyPoints) \| number: '1.0-2' }} | table cell, filled in at runtime |

**`src/app/draft-projection/player-projections-table/player-row/player-row.ts`**

| Text | Where |
| --- | --- |
| Day-To-Day | in code |
| Suspension | in code |
| Injured Reserve | in code |
| expected back ${formatDate(injury.expectedReturn, 'd MMMM', 'en')} | in code |

**`src/app/draft-projection/player-projections-table/player-row/stat-input/stat-input.html`**

| Text | Where |
| --- | --- |
| {{ isToi() ? formattedToi() : formattedValue() }} | inline text, filled in at runtime |

**`src/app/draft-projection/player-projections-table/columns-menu/columns-menu.html`**

| Text | Where |
| --- | --- |
| Stat group | screen-reader label on `<div>` |
| {{ labelFor(group) }} | button, filled in at runtime |
| Search stats | screen-reader label on `<input>` |
| Search stats… | placeholder on `<input>` |
| {{ option.statKey \| statLabel }} | inline text, filled in at runtime |
| {{ fullNameOf(option) }} | inline text, filled in at runtime |
| No stats match your search. | paragraph |

**`src/app/draft-projection/player-projections-table/columns-menu/columns-menu.ts`**

| Text | Where |
| --- | --- |
| Skater | in code |
| Goalie | in code |
| Utility | in code |

**`src/app/draft-projection/player-projections-table/league-settings-menu/league-settings-menu.html`**

| Text | Where |
| --- | --- |
| League setup | paragraph |
| Imported from {{ leagueName }} | inline text |
| Re-sync or change league | button |
| League size | field label |
| teams | inline text |
| Minimum goalie games | field label |
| What the goalie minimum does | label input on `<app-help-tip>` |
| Goalies projected for fewer games than this are ranked last. | text input on `<app-help-tip>` |
| Roster slots | paragraph |
| League size and roster slots tune the rankings for your league. | paragraph |

**`src/app/draft-projection/player-projections-table/position-filter/position-filter.html`**

| Text | Where |
| --- | --- |
| Position | field label |
| {{ option.label }} | dropdown option, filled in at runtime |

**`src/app/draft-projection/player-projections-table/position-filter/position-filter.ts`**

| Text | Where |
| --- | --- |
| All players | in code |

**`src/app/draft-projection/player-projections-table/position-menu/position-menu.html`**

| Text | Where |
| --- | --- |
| Positions for {{ playerName() }} | paragraph |
| {{ position }} | inline text, filled in at runtime |
| Use default positions | button |
| Reset every player to default | button |

**`src/app/draft-projection/player-projections-table/team-filter/team-filter.html`**

| Text | Where |
| --- | --- |
| Team | field label |
| All teams | dropdown option |
| {{ team }} | dropdown option, filled in at runtime |

**`src/app/draft-projection/full-season-dialog/full-season-dialog.html`**

| Text | Where |
| --- | --- |
| Set a full 84-game season? | heading (h2) |
| Every skater's games played will be set to 84. Goalies are left as they are: they share one net, so their games are a share of the schedule rather than all of it. | paragraph |
| Scale goalies to the 84-game season too | inline text |
| Only do this if the projection is built on an 82-game season. Each goalie's games are multiplied by 84/82, so a goalie who played 42 games becomes 43. The AI projection already runs to 84 games, and scaling it again adds about 2% to every goalie and pushes a team's games started past the 84 it plays. | paragraph |
| Scale each player's stats with games played | inline text |
| What scaling does | label input on `<app-help-tip>` |
| Only scale players with at least | field label |
| games played | inline text |
| Cancel | button |
| Set to 84 games | button |

**`src/app/draft-projection/full-season-dialog/full-season-dialog.ts`**

| Text | Where |
| --- | --- |
| Counting stats (goals, assists, …) scale with games played; rate stats like | in code |
| SH%, SV% and GAA are left unchanged. This overwrites any games-played values you've edited by hand. | in code |

**`src/app/draft-projection/share-dialog/share-dialog.html`**

| Text | Where |
| --- | --- |
| Share this projection | heading (h2) |
| Close | screen-reader label on `<button>` |
| Checking… | paragraph |
| Share link | screen-reader label on `<input>` |
| {{ copied() ? 'Copied!' : 'Copy' }} | button, filled in at runtime |
| To share a projection you need to pick a username. | paragraph |
| Pick a username | field label |
| e.g. beerleaguehero | placeholder on `<input>` |
| Credited to {{ username() }} . Change it on your profile. | paragraph |
| Cancel | button |
| {{ isSaving() ? 'Sharing…' : 'Create link' }} | button, filled in at runtime |
| {{ errorMessage() }} | paragraph, filled in at runtime |

**`src/app/draft-projection/share-dialog/share-dialog.ts`**

| Text | Where |
| --- | --- |
| Couldn't load your account. | in code |
| Couldn't check whether this is shared. | in code |
| That name is taken. Try another. | in code |
| Couldn't share this projection. | in code |
| Copying failed. Select the link and copy it manually. | in code |

**`src/app/draft-projection/sync-warning-dialog/sync-warning-dialog.html`**

| Text | Where |
| --- | --- |
| No longer in sync | heading (h2) |
| Undo my change and stay in sync | screen-reader label on `<button>` |
| Undo my change and stay in sync | tooltip on `<button>` |
| Changing this setting will take this projection out of sync with {{ leagueName() }} . If the league's settings changed in {{ platform() }}, re-sync to pull the latest instead. | paragraph |
| {{ error() }} | paragraph, filled in at runtime |
| {{ reSyncing() ? 'Re-syncing…' : 'Re-sync settings' }} | button, filled in at runtime |
| Keep my change | button |

**`src/app/shared/roster-slots-editor/roster-slots-editor.html`**

| Text | Where |
| --- | --- |
| {{ slot.label }} | inline text, filled in at runtime |

**`src/app/shared/roster-slots-editor/roster-slots-editor.ts`**

| Text | Where |
| --- | --- |
| Util | in code |

**`src/app/shared/player-pool-notice/player-pool-notice.html`**

| Text | Where |
| --- | --- |
| The player list has been updated | paragraph |
| {{ added() }} {{ added() === 1 ? 'player has' : 'players have' }} been added, new to the league since you started this projection. | paragraph |
| Your own numbers are untouched. Added players start from last season's stats, or at zero if you built this projection from scratch. Worth a look before you draft. | paragraph |
| Dismiss | screen-reader label on `<button>` |

**`src/app/shared/offseason-data-notice/offseason-data-notice.html`**

| Text | Where |
| --- | --- |
| It's the NHL off-season | paragraph |
| Team affiliations may be out of date. Off-season trades and signings aren't reflected yet. | list item |
| Most rookies aren't in the player list yet. | list item |
| It all updates automatically when the new season opens. | paragraph |

## League sync — inside the editor and Who's hot

Importing scoring and roster settings from Yahoo or ESPN. Offered in the editor's settings and from the Who's hot toolbar, through the same components.


**`src/app/draft-projection/league-sync-dialog/league-sync-dialog.html`**

| Text | Where |
| --- | --- |
| Import league settings | heading (h2) |
| Close | screen-reader label on `<button>` |

**`src/app/draft-projection/projection-settings-section/league-sync/league-sync.html`**

| Text | Where |
| --- | --- |
| {{ hint }} | paragraph, filled in at runtime |
| Fantasy platform to import from | screen-reader label on `<div>` |
| Yahoo | button |
| ESPN | button |

**`src/app/draft-projection/projection-settings-section/league-sync/league-sync.ts`**

| Text | Where |
| --- | --- |
| On Yahoo or ESPN? Choose your platform to auto-fill scoring and roster settings from your league. | in code |
| Yahoo | in code |
| On ${platform}? Auto-fill scoring and roster settings from your league. | in code |

**`src/app/draft-projection/projection-settings-section/yahoo-league-sync/yahoo-league-sync.html`**

| Text | Where |
| --- | --- |
| Sync from your Yahoo league | inline text |
| Checking… | inline text |
| {{ connecting() ? 'Connecting…' : 'Connect Yahoo account' }} | button, filled in at runtime |
| Loading your leagues… | inline text |
| No NHL leagues found. | inline text |
| Yahoo league | screen-reader label on `<select>` |
| Select a league… | dropdown option |
| {{ league.name }} | dropdown option, filled in at runtime |
| {{ syncing() ? 'Syncing…' : lastSync() ? 'Re-sync settings' : 'Sync settings' }} | button, filled in at runtime |
| {{ error() }} | paragraph, filled in at runtime |
| Synced from {{ sync.leagueName }} | inline text |
| · last synced {{ sync.syncedAt \| date: 'MMM d, y, h:mm a' }} | inline text |
| Not synced (no equivalent): {{ unsupportedStats().join(', ') }} | paragraph |

**`src/app/draft-projection/projection-settings-section/yahoo-league-sync/yahoo-league-sync.ts`**

| Text | Where |
| --- | --- |
| Could not start the Yahoo connection. | in code |
| your league | in code |
| Could not load the league settings from Yahoo. | in code |
| Could not load your Yahoo leagues. | in code |

**`src/app/draft-projection/projection-settings-section/espn-league-sync/espn-league-sync.html`**

| Text | Where |
| --- | --- |
| Sync from your ESPN league | inline text |
| Synced with {{ leagueName }} | inline text |
| Synced | inline text |
| · {{ syncedAt \| date: 'd MMM y, HH:mm' }} | inline text |
| League ID | inline text |
| e.g. 123456 | placeholder on `<input>` |
| ESPN league id | screen-reader label on `<input>` |
| My league is private | inline text |
| espn_s2 | inline text |
| espn_s2 cookie | screen-reader label on `<input>` |
| SWID | inline text |
| SWID cookie | screen-reader label on `<input>` |
| {{ showHelp() ? 'Hide' : 'How do I find these?' }} | button, filled in at runtime |
| Sign in at fantasy.espn.com in your browser. | list item |
| Open your browser's developer tools (F12) → Application (or Storage) → Cookies → fantasy.espn.com. | list item |
| Copy the values of espn_s2 and SWID (include SWID's braces) and paste them above. | list item |
| {{ syncing() ? 'Syncing…' : syncedLeagueId() ? 'Re-sync settings' : 'Sync settings' }} | button, filled in at runtime |
| {{ error() }} | paragraph, filled in at runtime |
| Synced from {{ syncedLeagueName() ?? id }} | inline text |
| Not synced (no equivalent): {{ unsupportedStats().join(', ') }} | paragraph |

**`src/app/draft-projection/projection-settings-section/espn-league-sync/espn-league-sync.ts`**

| Text | Where |
| --- | --- |
| Enter your ESPN league id. | in code |
| ESPN would not accept those cookies. Check the league id, and that espn_s2 and SWID were copied in full. | in code |
| This league is private. Add your espn_s2 and SWID cookies, then sync again. | in code |
| No ESPN league found for that id. | in code |
| Could not load the league settings from ESPN. Please try again. | in code |

## Stat names, tooltips and warnings — wherever a table is drawn

The vocabulary shared by the editor, the draft board, Who's hot and the shared page. The tooltip is what a column heading shows on hover; the warning is what an implausible number is flagged with.


**`src/app/pipes/stat-label.pipe.ts`**

| Text | Where |
| --- | --- |
| Goals | in code |
| Assists | in code |
| Hits | in code |
| Blocks | in code |
| Shifts | in code |
| Games Started | in code |
| Wins | in code |
| Losses | in code |
| Shutouts | in code |

**`src/app/pipes/stat-tooltip.pipe.ts`**

| Text | Where |
| --- | --- |
| Goals | in code |
| Assists | in code |
| Points | in code |
| Penalty Minutes | in code |
| Power Play Goals | in code |
| Power Play Assists | in code |
| Power Play Points | in code |
| Shorthanded Goals | in code |
| Shorthanded Assists | in code |
| Shorthanded Points | in code |
| Special Teams Goals | in code |
| Special Teams Assists | in code |
| Special Teams Points | in code |
| Game-Winning Goals | in code |
| Hat Tricks | in code |
| Shots on Goal | in code |
| Shooting Percentage | in code |
| Faceoffs Won | in code |
| Faceoffs Lost | in code |
| Hits | in code |
| Blocked Shots | in code |
| Defensemen Points | in code |
| Shifts | in code |
| Time on Ice | in code |
| Games Played | in code |
| Time on Ice per Game | in code |
| Games Started | in code |
| Wins | in code |
| Losses | in code |
| Overtime Losses | in code |
| Shutouts | in code |
| Shots Against | in code |
| Saves | in code |
| Goals Against | in code |
| Goals Against Average | in code |
| Save Percentage | in code |
| Win Percentage | in code |

**`src/app/services/stat-warning.service.ts`**

| Text | Where |
| --- | --- |
| Projected over the ${FULL_SEASON_GAMES}-game season | in code |
| Over 60 minutes per game | in code |
| More than total goals | in code |
| More than total goals | in code |
| More than total goals | in code |
| More than total assists | in code |
| More than total assists | in code |
| More than total points | in code |
| More goals than shots on goal | in code |
| Needs three goals each | in code |
| PPG + SHG exceed total goals | in code |
| PPG + SHG exceed total goals | in code |
| PPA + SHA exceed total assists | in code |
| PPA + SHA exceed total assists | in code |
| PPP + SHP exceed total points | in code |
| PPP + SHP exceed total points | in code |
| Doesn't equal Goals + Assists | in code |
| Doesn't equal PPG + PPA | in code |
| Doesn't equal SHG + SHA | in code |
| Doesn't equal PPG + SHG | in code |
| Doesn't equal PPA + SHA | in code |
| Doesn't equal STPG + STPA | in code |
| Over 100% | in code |
| Doesn't match Goals / SOG | in code |
| Doesn't equal TOI/G × GP | in code |
| More than games played | in code |
| Wins + losses + OT losses exceed games played | in code |
| More than wins | in code |
| More than shots against | in code |
| More than shots against | in code |
| Doesn't equal Saves + Goals against | in code |
| Over 100% | in code |
| Doesn't match Saves / Shots against | in code |
| Doesn't match Wins / Decisions | in code |
| More ice time than games played allows | in code |
| Doesn't match Goals against per 60 minutes | in code |

## Draft mode — `/draft` and `/projections/:id/draft`

`/draft` picks what to draft against. The board itself is the second route: setup, the available players, the picks, each team's roster, and the summary after the last pick.


**`src/app/draft-start/draft-start.html`**

| Text | Where |
| --- | --- |
| Draft mode | heading (h1) |
| Pick up a draft, or start a new one. | paragraph |
| Pick what you want to draft against. | paragraph |
| Couldn't load your draft sources | browser tooltip on `<app-error-state>` |
| Your drafts | heading (h2) |
| {{ draft.name }} | inline text, filled in at runtime |
| Complete | inline text |
| In progress | inline text |
| {{ sourceLabel(draft) }} · {{ timingLabel(draft) }} {{ draft.updatedAt \| relativeTime }} | inline text |
| {{ draftLabel(draft.draftStatus) }} | inline text, filled in at runtime |
| Discarding… | inline text |
| {{ discardPrompt(draft) }} | inline text, filled in at runtime |
| Yes, discard | button |
| Cancel | button |
| Start a new draft | heading (h2) |
| What do you want to draft against? | inline text |
| {{ option.name }} | inline text, filled in at runtime |
| {{ kindCount(option.kind) }} | inline text, filled in at runtime |
| Which one | fieldset legend |
| Every projection you have is drafted against already. Create another to draft against fresh numbers. | paragraph |
| No projections yet. Create one to draft against your own numbers. | paragraph |
| {{ projection.name }} | inline text, filled in at runtime |
| Updated {{ projection.updatedAt \| relativeTime }} | inline text |
| + Create a new projection | link |
| Nobody's board here yet. Paste a SlapStat share link below to copy one, and the copy is yours to draft against. | paragraph |
| {{ board.name }} | inline text, filled in at runtime |
| {{ sourceLabel(board) }} · imported {{ board.createdAt \| relativeTime }} | inline text |
| Every preset has a draft above. Discard that draft to start the preset fresh. | paragraph |
| {{ preset.name }} | inline text, filled in at runtime |
| Premium | inline text |
| The model's own line for every player. Part of Premium. | inline text |
| Unlock with Premium | link |
| Premium adds the AI projection, and any game range on Who's hot. | inline text |
| {{ isStarting() ? 'Starting…' : 'Start draft' }} | button, filled in at runtime |
| Open the projection | button |
| Discard draft | button |

**`src/app/draft-start/draft-start.ts`**

| Text | Where |
| --- | --- |
| Last Season's Stats | in code |
| AI Projection | in code |
| View summary | in code |
| Resume draft | in code |
| Preset | in code |
| From ${projection.origin.authorUsername} | in code |
| Your projection | in code |
| last pick | in code |
| Discard this draft? The picks are lost. | in code |
| Discard the picks? The projection stays. | in code |
| Couldn't discard the draft. Please try again. | in code |
| Couldn't start the draft. Please try again. | in code |

**`src/app/draft-mode/draft-mode.html`**

| Text | Where |
| --- | --- |
| ← Exit draft mode | link |
| {{ projectionName() }} | heading (h1), filled in at runtime |
| Draft mode | inline text |
| Finished | inline text |
| Saving… | inline text |
| Saved | inline text |
| Couldn't save, changes are unsaved | inline text |
| Draft complete | inline text |
| Up next: {{ upNextTeam()?.name }} | inline text |
| · you | inline text |
| Undo last pick | button |
| Edit teams | button |
| View summary | button |
| Finish draft | button |
| Finish the draft? | heading (h2) |
| Finishing marks the draft done and opens its summary. You can head back to the board and edit anytime. | paragraph |
| The draft isn't finished yet, {{ picks().length }} of {{ totalPicks() }} picks made. You can still finish and view the summary, then come back to keep drafting. | paragraph |
| Cancel | button |
| Finish draft | button |
| Remove pick #{{ preview.overall }}? | heading (h2) |
| Removing {{ lookup.name(preview.playerId) }} ({{ preview.mine ? 'You' : preview.teamName }}) will affect the following picks: | paragraph |
| {{ lookup.name(change.playerId) }} | inline text, filled in at runtime |
| #{{ change.oldOverall }} {{ change.oldTeamName }} | inline text |
| #{{ change.newOverall }} {{ change.newTeamName }} | inline text |
| Cancel | button |
| Remove pick | button |

**`src/app/draft-mode/draft-mode.ts`**

| Text | Where |
| --- | --- |
| All | in code |
| All | in code |
| Total Points | in code |
| Z-Score | in code |
| Draft | in code |
| Draft for ${team} | in code |
| Draft | in code |
| Couldn't load the draft. Please try again. | in code |

**`src/app/draft-mode/draft-setup/draft-setup.html`**

| Text | Where |
| --- | --- |
| Draft setup | heading (h2) |
| Name the teams, set the league size and the draft order. You can edit this later. | paragraph |
| Number of teams | inline text |
| Remove a team | screen-reader label on `<button>` |
| {{ numTeams() }} | inline text, filled in at runtime |
| Add a team | screen-reader label on `<button>` |
| Teams & draft order | inline text |
| {{ i + 1 }} | inline text, filled in at runtime |
| You | inline text |
| drafted | inline text |
| Drag to reorder | screen-reader label on `<span>` |
| Roster slots | inline text |
| Cancel | button |
| {{ canCancel() ? 'Save teams' : 'Start draft' }} | button, filled in at runtime |

**`src/app/draft-mode/draft-setup/draft-setup.ts`**

| Text | Where |
| --- | --- |
| My Team | in code |
| Team ${index} | in code |
| Team ${rows.length} | in code |
| My Team | in code |
| Team ${index} | in code |

**`src/app/draft-mode/draft-available-panel/draft-available-panel.html`**

| Text | Where |
| --- | --- |
| Replacing pick #{{ info.overall }} · {{ info.mine ? 'You' : info.teamName }} | inline text |
| Cancel | button |
| Available players | heading (h2) |
| Search player… | placeholder on `<input>` |
| {{ filter.label }} | button, filled in at runtime |
| Show stats | field label |
| Players per page | screen-reader label on `<select>` |
| Show | field label |
| {{ option.label }} | dropdown option, filled in at runtime |
| {{ scoreHeading() }} | inline text, filled in at runtime |
| {{ i + 1 }} | inline text, filled in at runtime |
| {{ lookup.name(sp.projection.playerId) }} | inline text, filled in at runtime |
| {{ pos }} | inline text, filled in at runtime |
| {{ lookup.team(sp.projection.playerId) }} | inline text, filled in at runtime |
| {{ scoreLabel(sp) }} | inline text, filled in at runtime |
| Pick | button |
| {{ draftLabel() }} | button, filled in at runtime |
| {{ stat.key \| statLabel }} | inline text, filled in at runtime |
| {{ stat.value }} | inline text, filled in at runtime |
| Show more ({{ availableCount() - visibleAvailable().length }} more) | button |
| No available players match. | paragraph |

**`src/app/draft-mode/draft-picks-panel/draft-picks-panel.html`**

| Text | Where |
| --- | --- |
| Draft picks | heading (h2) |
| {{ picksCount() }} | inline text, filled in at runtime |
| Round {{ round.round }} | div |
| {{ entry.overall }} | inline text, filled in at runtime |
| {{ lookup.name(entry.playerId) }} | inline text, filled in at runtime |
| {{ entry.mine ? 'You' : entry.teamName }} | inline text, filled in at runtime |
| Change pick | screen-reader label on `<button>` |
| Change this pick | tooltip on `<button>` |
| Remove pick | screen-reader label on `<button>` |
| Remove this pick | tooltip on `<button>` |
| No picks yet. | paragraph |

**`src/app/draft-mode/draft-roster-panel/draft-roster-panel.html`**

| Text | Where |
| --- | --- |
| View a team's roster | screen-reader label on `<select>` |
| {{ team.name }}{{ team.mine ? ' (You)' : '' }} | dropdown option |
| {{ filledCount() }} / {{ totalSlots() }} | inline text |
| {{ slot.label }} | inline text, filled in at runtime |
| {{ lookup.name(slot.playerId) }} | inline text, filled in at runtime |
| {{ pos }} | inline text, filled in at runtime |
| {{ lookup.team(slot.playerId) }} | inline text, filled in at runtime |
| Empty | inline text |
| Extra | inline text |
| {{ lookup.name(playerId) }} | inline text, filled in at runtime |
| {{ pos }} | inline text, filled in at runtime |
| {{ lookup.team(playerId) }} | inline text, filled in at runtime |

**`src/app/draft-mode/draft-roster.service.ts`**

| Text | Where |
| --- | --- |
| Util | in code |

**`src/app/draft-mode/draft-results/draft-results.html`**

| Text | Where |
| --- | --- |
| Draft results view | screen-reader label on `<div>` |
| Round | button |
| Team | button |
| Round {{ round.round }} | div |
| {{ pick.pickInRound }} | inline text, filled in at runtime |
| ({{ pick.overall }}) | inline text |
| {{ lookup.name(pick.playerId) }} | inline text, filled in at runtime |
| {{ pick.teamName }} | inline text, filled in at runtime |
| No picks yet. | paragraph |
| {{ entry.team.name }} | div, filled in at runtime |
| You | inline text |
| {{ i + 1 }} | inline text, filled in at runtime |
| ({{ pick.overall }}) | inline text |
| {{ lookup.name(pick.playerId) }} | inline text, filled in at runtime |
| No picks. | paragraph |

**`src/app/draft-mode/draft-summary/draft-summary.html`**

| Text | Where |
| --- | --- |
| Draft summary | heading (h2) |
| ← Edit draft | button |
| Draft summary view | screen-reader label on `<div>` |
| League projection | button |
| Draft results | button |

**`src/app/draft-mode/league-projection-table/league-projection-table.html`**

| Text | Where |
| --- | --- |
| No teams yet. | paragraph |
| Breakdown | screen-reader label on `<div>` |
| By category | button |
| By position | button |
| Tap a team to expand its players | inline text |
| Team | table heading |
| {{ column.label }} | table heading, filled in at runtime |
| {{ sortIndicator(column.key) }} | inline text, filled in at runtime |
| ×{{ formatWeight(column.weight) }} | inline text |
| {{ scoreHeading() }} | table heading, filled in at runtime |
| {{ sortIndicator('total') }} | inline text, filled in at runtime |
| {{ i + 1 }} | table cell, filled in at runtime |
| {{ team.name }} | inline text, filled in at runtime |
| You | inline text |
| {{ format(team.values[column.key], column.decimals) }} | inline text, filled in at runtime |
| {{ player.name }} | inline text, filled in at runtime |
| {{ format(player.value, column.rawDecimals) }} | inline text, filled in at runtime |
| {{ formatTotal(team.total) }} | table cell, filled in at runtime |
| {{ player.name }} | inline text, filled in at runtime |
| {{ format(player.values[column.key], column.rawDecimals) }} | table cell, filled in at runtime |
| {{ formatTotal(player.total) }} | table cell, filled in at runtime |
| {{ isShowingAll(team.teamId) ? 'Show top 5' : 'Show all ' + team.roster.length + ' players' }} | button, filled in at runtime |

**`src/app/draft-mode/league-projection.ts`**

| Text | Where |
| --- | --- |
| Left Wing | in code |
| Right Wing | in code |
| Util | in code |
| Utility | in code |
| Bench | in code |

## Who's hot — `/whos-hot`

The form leaderboard: the game range at the top, then the table. The range is where Premium is sold on this page.


**`src/app/whos-hot/whos-hot.html`**

| Text | Where |
| --- | --- |
| Who's hot | heading (h1) |
| What this page shows | label input on `<app-help-tip>` |
| Check which players have performed the best over a selected time period, customized to your league settings. | text input on `<app-help-tip>` |
| Season | field label |
| {{ option.label }} | dropdown option, filled in at runtime |
| Couldn't load the leaderboard | browser tooltip on `<app-error-state>` |
| Imported from ' + leagueName + ' (click to re-sync or change league) | tooltip on `<button>` |
| Synced with {{ leagueName }} | inline text |
| Import league | button |

**`src/app/whos-hot/game-range-selector/game-range-selector.html`**

| Text | Where |
| --- | --- |
| Game range and scoring options | screen-reader label on `<section>` |
| Game range | inline text |
| {{ preset.label }} | button, filled in at runtime |
| Premium | link |
| Why the other ranges are off | label input on `<app-help-tip>` |
| A free account sees the last 5 games. Premium membership unlocks the rest of the presets and the slider, so you can measure any stretch of the season. | text input on `<app-help-tip>` |
| First game in the range | screen-reader label on `<input>` |
| Drag to set the first game in the range | screen-reader label on `<input>` |
| Drag to set the last game in the range | screen-reader label on `<input>` |
| Last game in the range | screen-reader label on `<input>` |
| {{ summary() }} | inline text, filled in at runtime |
| Per game | button |
| What per game does | label input on `<app-help-tip>` |
| Off, the leaderboard shows totals over the range, so a player who missed games shows less, which is usually the point. On, it divides by the games each player actually dressed for, so someone who missed half the range isn't buried. | text input on `<app-help-tip>` |
| Min. games | field label |
| What the minimum does | label input on `<app-help-tip>` |
| Hide players with fewer appearances in the range. | text input on `<app-help-tip>` |
| Your minimum of {{ minGamesRequested() }} is more than this range holds. | inline text |

**`src/app/whos-hot/game-range-selector/game-range-selector.ts`**

| Text | Where |
| --- | --- |
| Last 5 | in code |
| Last 10 | in code |
| Last 20 | in code |
| Last 30 | in code |
| First half | in code |
| Second half | in code |
| Full season | in code |
| ${games} game${games === 1 ? '' : 's'} | in code |
| calc(${(fraction * 100).toFixed(3)}% + ${(0.5 - fraction).toFixed(4)} * var(--thumb-size)) | in code |

**`src/app/whos-hot/hot-players-table/hot-players-table.html`**

| Text | Where |
| --- | --- |
| Leaderboard | screen-reader label on `<section>` |
| League type | screen-reader label on `<div>` |
| Points | button |
| Category | button |
| League setup | button |
| Stats | button |
| Search | field label |
| Search player… | placeholder on `<input>` |
| {{ index + 1 }} | table cell, filled in at runtime |
| {{ ranked.hot.name }} ({{ positionLabel(ranked) }}) | inline text |
| {{ ranked.hot.teamAbbrev }} | inline text, filled in at runtime |
| Fewer games than the league's goalie minimum, so this goalie is ranked last. | tooltip on `<span>` |
| Below min. games | inline text |
| {{ statValue(ranked, col) \| formatToi }} | table cell, filled in at runtime |
| {{ statValue(ranked, col) \| number: decimalsFor(col) }} | table cell, filled in at runtime |
| {{ statValue(ranked, col) \| number: decimalsFor(col) }} | table cell, filled in at runtime |
| {{ summaryValue(ranked) \| number: '1.0-2' }} | table cell, filled in at runtime |
| No games have been played in the {{ seasonLabel() }} season yet. | paragraph |
| No players match. Try a wider game range, a lower minimum, or a different filter. | paragraph |
| Showing {{ visiblePlayers().length }} of {{ matchingCount() }} | inline text |
| Show more | button |

## A shared projection — `/s/:token`

The public page behind a share link. Opens for someone who has never signed in, so its copy is read by people with no account.


**`src/app/shared-projection/shared-projection.html`**

| Text | Where |
| --- | --- |
| This link isn't active | heading (h1) |
| Whoever shared this projection has taken the link down, or it never existed. You can still build your own. It's free to start. | paragraph |
| Make your own projection | link |
| Couldn't load this projection | browser tooltip on `<app-error-state>` |
| Check your connection and try again. | message on `<app-error-state>` |
| Shared projection | paragraph |
| {{ projection.name }} | heading (h1), filled in at runtime |
| By {{ authorLabel() }} · {{ leagueSummary() }} | paragraph |
| Create your own projection from a copy of this one | tooltip on `<button>` |
| {{ importingInto() === 'projection' ? 'Copying…' : 'Create projection' }} | button, filled in at runtime |
| Enter Draft mode with a copy of this projection | tooltip on `<button>` |
| {{ importingInto() === 'draft' ? 'Copying…' : 'Draft mode' }} | button, filled in at runtime |
| Your copy of this board lives in your account, so log in or create an account {{ intent === 'draft' ? 'to draft against it.' : 'to make it yours.' }} Free to start, and this carries on where you left off. | paragraph |
| Player projections | heading (h2) |
| Showing {{ visibleRows().length }} of {{ matchingCount() }} | inline text |
| Show more | button |
| This link opens the top {{ projection.data.players.length }} of {{ totalPlayers() }} players | heading (h2) |
| Sign in to read the rest of {{ authorLabel() }}'s board (every player they ranked, under their league's scoring settings) and take a copy to draft against. Free to start. | paragraph |
| Log in | link |
| Create an account | link |
| This is one manager's board | heading (h2) |
| Build your own projections, tuned to your league's scoring settings, and rank every player the way this one does, or draft straight against this one. Free to start. | paragraph |
| Make your own projection | link |
| Projections are the work of {{ authorLabel() }}, not SlapStat. Underlying data © MoneyPuck.com and the NHL. | paragraph |

**`src/app/shared-projection/shared-projection.ts`**

| Text | Where |
| --- | --- |
| Couldn't copy this board. Please try again. | in code |
| Points league | in code |
| Category league | in code |
| ${scoring} · ${settings.leagueSize} teams | in code |

**`src/app/services/projection-share.service.ts`**

| Text | Where |
| --- | --- |
| Player ${scored.projection.playerId} | in code |

## Premium — `/pricing`, `/pay`, `/account`

What Premium is, the checkout it opens, and the subscription page afterwards. The perk list is shared by all three, so it is written once.


**`src/app/pricing/pricing.html`**

| Text | Where |
| --- | --- |
| SlapStat | heading (h1) |
| Premium | inline text |
| One plan, billed monthly, cancel anytime. Here is what it adds to the free app. | paragraph |
| Free | heading (h2) |
| No card, no time limit. | paragraph |
| {{ feature }} | list item, filled in at runtime |
| Create a free account | link |
| Your current plan | paragraph |
| Premium | heading (h2) |
| {{ price }} | inline text, filled in at runtime |
| per month | inline text |
| Shown in your own currency. Tax is added or included as your country requires, and the exact total is confirmed at checkout. | paragraph |
| Billed monthly. The price, in your own currency, is confirmed at checkout. | paragraph |
| Everything in Free | inline text |
| {{ perk.title }} | inline text, filled in at runtime |
| {{ perk.description }} | inline text, filled in at runtime |
| Sign in to subscribe | link |
| New here? Create a free account first, then come back. | paragraph |
| Premium | inline text |
| You already have it. | paragraph |
| Manage subscription | link |
| {{ starting() ? 'Starting…' : 'Subscribe' }} | button, filled in at runtime |
| Secure checkout by Paddle, our merchant of record. Cancel anytime from your subscription page. | paragraph |
| Good to know | heading (h2) |
| Can I cancel? | term |
| Any time, from your subscription page. Cancelling stops the next charge, and you keep Premium until the end of the month you have already paid for. | definition |
| Who charges my card? | term |
| Paddle, who sell SlapStat Premium on our behalf and handle payment and tax. Their name is what appears on your statement. | definition |
| What if it is not for me? | term |
| Write to us within 14 days of your first payment and we refund the month in full. The refund policy has the details. | definition |
| Will the price change? | term |
| The price you sign up at is the price you keep, unless we tell you first. The terms say so. | definition |

**`src/app/pricing/pricing.ts`**

| Text | Where |
| --- | --- |
| Checkout could not be started. Nothing has been charged, and we have been notified. | in code |

**`src/app/pay/pay.html`**

| Text | Where |
| --- | --- |
| Checkout could not be opened | heading (h1) |
| Something went wrong on the way to the payment window. Nothing has been charged. | paragraph |
| Back to pricing | link |
| Opening secure checkout | heading (h1) |
| This takes a moment. Please do not close this page. | paragraph |
| Nothing is charged until you confirm in the payment window. | paragraph |

**`src/app/account/account.html`**

| Text | Where |
| --- | --- |
| Subscription | heading (h1) |
| Your plan, and where to change it. | paragraph |
| Welcome to Premium | heading (h2) |
| Thanks for subscribing! Everything below is yours now. | paragraph |
| {{ perk.linkLabel }} | link, filled in at runtime |
| Thanks for subscribing! | paragraph |
| Loading your subscription… | paragraph |
| Couldn't load your subscription. | paragraph |
| Try again | button |
| Premium active | inline text |
| Cancelled. You keep Premium until {{ entitlement.currentPeriodEnd() \| date: 'longDate' }}, and nothing more is charged. | paragraph |
| Cancelled. You keep Premium until the end of the period you have paid for, and nothing more is charged. | paragraph |
| Renews on {{ entitlement.currentPeriodEnd() \| date: 'longDate' }}. | paragraph |
| {{ openingPortal() ? 'Opening…' : 'Manage subscription' }} | button, filled in at runtime |
| Change your card, download receipts or cancel in the billing portal. Paddle, our merchant of record, runs it on our behalf. | paragraph |
| Confirming | inline text |
| Your payment went through. We are waiting for the confirmation, which usually takes a few seconds. | paragraph |
| Confirming | inline text |
| Your payment went through, but the confirmation has not reached us yet. It will arrive on its own. If this page still looks wrong in a few minutes, write to info@slapstat.com and we will sort it out. | paragraph |
| Check again | button |
| Free plan | inline text |
| You have everything in the free app. Premium adds: | paragraph |
| {{ perk.title }} | inline text, filled in at runtime |
| {{ perk.description }} | inline text, filled in at runtime |
| Upgrade to Premium | link |

**`src/app/account/account.ts`**

| Text | Where |
| --- | --- |
| The billing portal could not be opened. Your subscription is unchanged, and we have been notified. | in code |

**`src/app/shared/premium/premium-perks.ts`**

| Text | Where |
| --- | --- |
| The AI projection | in code |
| A model-built line for every player, ready to draft from as it is or to tune into your own. | in code |
| Start an AI projection | in code |
| Any game range on Who's hot | in code |
| Every preset and the slider, from the last 10 games to the full season. Free accounts see the last 5. | in code |
| Pick a range on Who's hot | in code |
| New tools first | in code |
| New premium features land here as they are built, at the price you signed up at. | in code |
| Projections tailored to your league, points or categories | in code |
| The live draft board and post-draft power rankings | in code |
| League settings imported from Yahoo or ESPN | in code |
| League settings imported from Yahoo | in code |
| Share a projection as a link | in code |
| Who's hot over the last 5 games | in code |

**`src/app/shared/premium/premium-refused.ts`**

| Text | Where |
| --- | --- |
| The AI projection is part of Premium. Open Premium from the account menu to subscribe. | in code |

## Profile — `/profile`

The picture and the public name, reached from the avatar at the right of the header.


**`src/app/profile/profile.html`**

| Text | Where |
| --- | --- |
| Couldn't load your profile | browser tooltip on `<app-error-state>` |
| Check your connection and try again. | message on `<app-error-state>` |
| Profile | heading (h1) |
| Profile picture | heading (h2) |
| {{ isUploading() ? 'Saving…' : avatarUrl() ? 'Change picture' : 'Upload picture' }} | button, filled in at runtime |
| Remove | button |
| {{ avatarError() }} | paragraph, filled in at runtime |
| Username | heading (h2) |
| Your name will only be shown if you share your player projections. | paragraph |
| Username | field label |
| e.g. beerleaguehero | placeholder on `<input>` |
| {{ usernameRule }} | paragraph, filled in at runtime |
| {{ isSaving() ? 'Saving…' : 'Save' }} | button, filled in at runtime |
| Saved | inline text |
| {{ errorMessage() }} | paragraph, filled in at runtime |

**`src/app/profile/profile.ts`**

| Text | Where |
| --- | --- |
| That name is taken. Try another. | in code |
| Couldn't save your name. | in code |
| Unsupported file format. Please upload a PNG, JPEG, or WebP image. | in code |
| Couldn't read that file as a picture. Try a PNG or JPEG. | in code |
| Couldn't save your picture. | in code |
| Couldn't remove your picture. | in code |

**`src/app/models/username.ts`**

| Text | Where |
| --- | --- |
| Username must be 3–20 characters long and can only contain letters, numbers, and underscores. | in code |

## Legal — `/privacy`, `/terms`, `/refunds`

Public and unguarded, linked from the footer on every page. Read by Paddle's reviewers as well as by customers, and the one place on the site where the wording is a commitment rather than a description.


**`src/app/privacy/privacy.html`**

| Text | Where |
| --- | --- |
| Privacy policy | heading (h1) |
| Last updated {{ lastUpdated }} | paragraph |
| SlapStat is a fantasy hockey projection tool. This page explains exactly what we store about you, who else sees it, and what you can ask us to do about it. It describes what the software actually does, not what a template says it might. | paragraph |
| Who is responsible | heading (h2) |
| SlapStat is run by Alexander Berglund, an individual in Sweden, not a company. That makes him the controller of your personal data. If you have a question about your data, or want to exercise any of the rights below, email privacy@slapstat.com and it reaches him directly. | paragraph |
| What we store, and why | heading (h2) |
| Your account | heading (h3) |
| Created when you register, and kept for as long as your account exists: | paragraph |
| Your email address. It identifies your account and is where we send verification and password-reset messages. | list item |
| A hash of your password, never the password itself. If you signed up with Google or Facebook, there is no password at all, only an opaque account identifier from that provider. | list item |
| An internal account ID, whether your email is verified, and when the account was created. | list item |
| We store no name, phone number, address or date of birth. We rely on the above to give you the service you asked for: without an account we cannot save your work or let you sign back in. | paragraph |
| Your projections | heading (h3) |
| The projections you create: their name, the season, and the player numbers and scoring settings you entered. | paragraph |
| If you sync a projection from a Yahoo league, it also saves your league's name and the team names of the other managers in it. Those names are often real names or nicknames, so a projection can contain information about people other than you. Only you can see your own projections, and you can delete any of them at any time. | paragraph |
| Yahoo Fantasy (only if you connect it) | heading (h3) |
| Connecting your Yahoo account is entirely optional and nothing happens until you choose it. If you do, we store your Yahoo access and refresh tokens encrypted, along with your Yahoo user identifier, so we can read your league's scoring settings. Your league and team data itself is read from Yahoo as you use the app and is not stored, except for what you deliberately save into a projection. | paragraph |
| There is no disconnect button yet. Once connected, those tokens stay until we remove them for you. Email us and we will. | paragraph |
| Usage analytics (only if you agree) | heading (h3) |
| If you accept the cookie banner, we record which pages you visit and a few actions (registering, creating a projection, starting a draft) so we can see what people use and where they get stuck. While signed in, this is linked to your account ID, never your email address. | paragraph |
| If you decline, we still count the visit, but through a privacy-preserving hash generated on PostHog's servers rather than a cookie, and it is not linked to you or to any other day's visit. You can change your mind at any time by clearing this site's data in your browser. | paragraph |
| Links that carry a single-use token (password resets and email verification) have that token stripped out before any analytics event leaves your browser. | paragraph |
| If you email us | heading (h3) |
| Writing to info@slapstat.com or privacy@slapstat.com means we hold your message and the address you sent it from, for as long as it takes to answer you and for as long as the thread stays in the mailbox afterwards. There is no ticket system behind those addresses: Cloudflare forwards mail sent to this domain into a Google mailbox that Alexander reads. Ask us to delete a conversation and we will. | paragraph |
| What we put in your browser | heading (h2) |
| Stored | table heading |
| Purpose | table heading |
| Set when | table heading |
| Sign-in tokens | table cell |
| Keeps you signed in between visits. Your email address is readable inside these tokens, so treat them as you would a password. | table cell |
| You sign in. Necessary: the site cannot work without it. | table cell |
| Your cookie choice | table cell |
| Remembers your answer so we stop asking. | table cell |
| You answer the banner. | table cell |
| PostHog analytics cookie | table cell |
| Recognises a returning visitor. | table cell |
| Only if you accept. Declining means no cookie is ever set. | table cell |
| Who else sees your data | heading (h2) |
| We do not sell your data and we do not share it for advertising. We use a small number of suppliers to run the service, and they may only process data on our instructions: | paragraph |
| Supplier | table heading |
| What they get | table heading |
| Where | table heading |
| Cloudflare | table cell |
| Email you send to an address at this domain, which it forwards to the mailbox below. It also answers DNS for us, but it does not sit in front of the site, so it never sees your visits. | table cell |
| United States, on a network spanning many countries | table cell |
| Google (Gmail) | table cell |
| The mailbox that email you send us is delivered to and kept in. | table cell |
| United States | table cell |
| Hetzner | table cell |
| Hosts the servers and databases, so everything above lives there. | table cell |
| Helsinki, Finland (EU) | table cell |
| Paddle | table cell |
| Only if you subscribe. Paddle are the merchant of record for the sale, so they take your payment details, your billing country and the email on your account, and they keep the record of the transaction. We never see your card number. | table cell |
| United Kingdom, and the United States for card processing | table cell |
| PostHog | table cell |
| Usage analytics, only if you accept the banner. | table cell |
| Frankfurt, Germany (EU) | table cell |
| Resend | table cell |
| Your email address and a sign-in link, to deliver exactly two messages: verify your email, and reset your password. | table cell |
| United States | table cell |
| Sentry | table cell |
| Technical error reports when something breaks: stack traces, not your account details. | table cell |
| Germany (EU) | table cell |
| Your account, your projections and everything else we store stay inside the EU. Email is the exception, and it is one in both directions. Resend is in the United States, so your address leaves the EU when we send you a verification or password-reset message. Anything you write to us leaves it too, since Cloudflare forwards that mail and Google stores it, and both are United States companies. | paragraph |
| Companies your browser contacts directly | heading (h3) |
| Some things on the page are loaded from other companies' servers. That means those companies receive your IP address and browser details simply because the page rendered. We never send them your account data, but we cannot hide the request from them either: | paragraph |
| Google Fonts: our typeface loads from Google on every page, whether or not you have an account or accepted cookies. | list item |
| Google and Facebook: their sign-in buttons load their code on the sign-in and registration pages, whether or not you use them. | list item |
| Yahoo: player photos are served from Yahoo's servers wherever players are listed. | list item |
| Paddle: our pricing and checkout pages load their code, the pricing page so that it can quote the price in your own currency. Those two pages only. If you never look at what Premium costs, your browser never contacts them. | list item |
| If you sign in with Google or Facebook, or connect Yahoo, those companies also handle your data under their own privacy policies. That relationship is between you and them. | paragraph |
| How long we keep it | heading (h2) |
| Your account and projections stay until the account is deleted. Analytics data is kept for one year. Password-reset and email-verification links stop working quickly and can only be used once, but the used-up record of one is not currently swept away on a schedule. It stays until you request another, or until we delete your account. | paragraph |
| Your rights | heading (h2) |
| Under the GDPR you can ask us to give you a copy of your data, correct it, delete it, hand it over in a portable form, or stop a particular use of it. Where we rely on your consent (that is, analytics), you can withdraw it at any time, and doing so is as easy as giving it. | paragraph |
| SlapStat has no self-service delete or export button yet. Until it does, email the address above and we will do it by hand. We would rather say that plainly than imply a button exists. | paragraph |
| If you think we are handling your data wrongly, you can complain to your local data protection authority. In Sweden that is Integritetsskyddsmyndigheten (IMY). | paragraph |
| Changes | heading (h2) |
| If we change what we collect or who we send it to, we will update this page and move the date at the top. Where a change needs your agreement, we will ask for it rather than assume it. | paragraph |

**`src/app/privacy/privacy.ts`**

| Text | Where |
| --- | --- |
| 5 September 2026 | in code |

**`src/app/terms/terms.html`**

| Text | Where |
| --- | --- |
| Terms and conditions | heading (h1) |
| Last updated {{ lastUpdated }} | paragraph |
| These terms cover your use of SlapStat, including the paid Premium membership. They describe what the service actually does and what you can expect from it. Please read the refund policy and the privacy policy too. Together they are the whole agreement. | paragraph |
| Who you are dealing with | heading (h2) |
| SlapStat is run by Alexander Berglund, an individual in Sweden, not a company. You can reach him at info@slapstat.com. | paragraph |
| Payments are a separate matter. When you subscribe, your contract of sale is with Paddle, who act as the merchant of record. Paddle handle the payment, charge and remit any VAT or sales tax that applies where you live, issue your receipt and process refunds. Their name, not SlapStat, is what appears on your card statement, and their own buyer terms apply to that transaction alongside these. | paragraph |
| Your account | heading (h2) |
| You need an account to save any work. One account per person. | list item |
| Give a working email address. It is how we verify the account and how you recover access if you forget your password, and it is the only way we can reach you. | list item |
| Keep your password to yourself. Anything done from your account is treated as done by you. | list item |
| You can delete your account whenever you like. Deleting it ends any subscription at the end of the period you have already paid for. | list item |
| We may suspend or close an account that is being used to attack the service or to harm other people. If we do, we will say why. | list item |
| Premium membership | heading (h2) |
| Premium is a monthly subscription. It renews automatically each month until you cancel, and the price you signed up at is the price you keep unless we tell you otherwise in advance. | list item |
| You can cancel at any time from your account page. Cancelling stops the next charge. You keep Premium until the end of the period you have already paid for, and nothing is taken after that. | list item |
| Premium unlocks features on top of the free app, including the projection model. Which features are included can change as the app develops. We will not remove something substantial from Premium without telling you first. | list item |
| If a payment fails, we will keep trying for a short while before the subscription lapses. Your projections are not deleted when that happens. | list item |
| What the projections are, and are not | heading (h2) |
| SlapStat produces estimates. The model is built from historical statistics and it will be wrong about individual players, sometimes badly. Nothing here is a prediction you should rely on for money. | paragraph |
| In particular, SlapStat is not gambling advice and is not intended for betting. If you use it that way, that is your decision and your risk alone. | paragraph |
| Other people's data and services | heading (h2) |
| Player statistics, league settings and photographs come from third parties, including Yahoo and ESPN. SlapStat is not affiliated with, endorsed by or sponsored by the National Hockey League, Yahoo or ESPN. When you connect one of those accounts you are also bound by that provider's own terms, and they can change or withdraw their data at any time, which may change what SlapStat can show you. | paragraph |
| Using the service fairly | heading (h2) |
| Please do not: | paragraph |
| scrape the site, or hit the API in bulk or automatically | list item |
| resell, redistribute or republish the projection output as your own product | list item |
| try to reach another user's account or data | list item |
| upload anything unlawful, or anything you do not have the right to share | list item |
| Availability | heading (h2) |
| SlapStat is run by one person. There is no uptime guarantee. Features can change and the service could one day be discontinued. If it is discontinued while you are paying for Premium, you will be refunded for the part of the period you paid for and did not get. | paragraph |
| Liability | heading (h2) |
| The service is provided as it is. To the extent the law allows, SlapStat is not liable for indirect or consequential loss, for lost fantasy leagues or wagers, or for decisions you make on the strength of a projection. | paragraph |
| Nothing here limits rights you have as a consumer that cannot be limited by agreement. If you live in the EU or the UK, your statutory rights stand whatever this page says. | paragraph |
| Changes to these terms | heading (h2) |
| We may update these terms. If a change materially affects you as a paying member, we will email you before it takes effect. Carrying on using SlapStat after that means you accept the new version. | paragraph |
| Law and disputes | heading (h2) |
| These terms are governed by Swedish law, and the Swedish courts have jurisdiction. If you are a consumer, you keep the protection of the mandatory law of the country you live in, and you may bring a claim there. Consumers in the EU can also use the European Commission's online dispute resolution platform. | paragraph |

**`src/app/terms/terms.ts`**

| Text | Where |
| --- | --- |
| 6 September 2026 | in code |

**`src/app/refunds/refunds.html`**

| Text | Where |
| --- | --- |
| Refund policy | heading (h1) |
| Last updated {{ lastUpdated }} | paragraph |
| Premium is a monthly subscription, so the most you can ever have at stake is one month. This page says when you get that month back, and how to ask. It sits alongside the terms and conditions. | paragraph |
| Cancelling is not the same as a refund | heading (h2) |
| You can cancel from your account page at any time. Cancelling stops the next charge and nothing more is taken. You keep Premium until the end of the month you have already paid for, so there is no reason to cancel early in the hope of saving anything. | paragraph |
| A refund is different: it returns money you have already paid. The rest of this page is about that. | paragraph |
| Your 14 day right to change your mind | heading (h2) |
| If you live in the EU or the UK, consumer law gives you 14 days from the day you subscribe to withdraw and get your money back, with no reason needed. | paragraph |
| One thing to know: because Premium starts working the moment you pay, you are asked at checkout to agree that the service begins immediately. Where you have agreed to that and have used Premium, the amount refunded can be reduced in proportion to what you used. In practice, for a membership priced at one month, we refund the month in full inside those 14 days and do not quibble over a few days of use. | paragraph |
| Outside the 14 days | heading (h2) |
| We will refund the current month in full if: | paragraph |
| the service was substantially broken or unavailable for a meaningful part of the month | list item |
| you were charged after cancelling, or charged twice | list item |
| you never intended to subscribe, for example a subscription taken out on your card without your knowledge | list item |
| Outside those cases we do not refund months you have already used. If your situation does not fit neatly into the list, write to us anyway and explain. It is one person reading the mail and the answer will be a real one. | paragraph |
| We do not refund on the grounds that a projection turned out to be wrong. The model produces estimates and says so plainly before you buy. | paragraph |
| How to ask | heading (h2) |
| Email info@slapstat.com from the address on your account, and say which charge you mean. You do not need an order number, though it helps if you have the receipt to hand. | paragraph |
| You can also reply to the receipt Paddle sent you, since Paddle are the merchant of record for the sale and can process a refund directly. | paragraph |
| How you get the money | heading (h2) |
| Refunds are made by Paddle to the payment method you used. Paddle usually send them within a few business days, and your bank or card issuer can take several more to show it. If more than ten business days pass with nothing showing, tell us and we will chase it. | paragraph |
| Premium access ends when a refund is issued for the month it covered. | paragraph |
| If we cannot agree | heading (h2) |
| Consumers in the EU can take a dispute to the European Commission's online dispute resolution platform, and consumers in Sweden to the National Board for Consumer Disputes (ARN). Doing so costs you nothing and does not affect your other rights. | paragraph |

**`src/app/refunds/refunds.ts`**

| Text | Where |
| --- | --- |
| 6 September 2026 | in code |

## Admin — `/admin`

Reachable only by an admin account. Included for completeness: no ordinary user sees any of it.


**`src/app/admin/admin.html`**

| Text | Where |
| --- | --- |
| Admin | heading (h1) |
| Manage the Yahoo service account and refresh player data. | paragraph |
| {{ error() }} | paragraph, filled in at runtime |
| Yahoo service account | heading (h2) |
| The app uses one Yahoo account to fetch all player data (identity, eligible positions and season stats). Connect it once; it stays connected until Yahoo revokes access. | paragraph |
| Checking… | inline text |
| ● Connected | inline text |
| ● Not connected | inline text |
| {{ message }} | paragraph, filled in at runtime |
| Dismiss | button |
| {{ connected() ? 'Reconnect Yahoo account' : 'Connect Yahoo account' }} | button, filled in at runtime |
| Player data sync | heading (h2) |
| Pull the latest player data from Yahoo and rebuild the player list. Also runs automatically on a daily schedule. | paragraph |
| {{ syncMessage() }} | paragraph, filled in at runtime |
| ● Last sync OK | inline text |
| ● Last sync failed | inline text |
| {{ run.finishedAt ?? run.startedAt \| relativeTime }} | inline text, filled in at runtime |
| {{ run.skaters ?? 0 }} skaters · {{ run.goalies ?? 0 }} goalies | paragraph |
| +{{ run.addedCount }} added | inline text |
| −{{ run.removedCount }} removed | inline text |
| since the previous sync | paragraph |
| Show changes | expander label |
| Added | paragraph |
| {{ name }} | list item, filled in at runtime |
| Removed | paragraph |
| {{ name }} | list item, filled in at runtime |
| {{ run.error }} | paragraph, filled in at runtime |
| No syncs recorded yet. | paragraph |
| {{ syncing() ? 'Syncing…' : 'Run sync now' }} | button, filled in at runtime |
| Recent syncs | expander label |
| {{ run.finishedAt ?? run.startedAt \| relativeTime }} | inline text, filled in at runtime |
| +{{ run.addedCount }} / −{{ run.removedCount }} | inline text |
| failed | inline text |
| Yahoo access probe | heading (h2) |
| Ask Yahoo one question: will it serve this game's players? A failed sync only says that something was refused; vary the game key and season here to find out what. Reads nothing into the cache and writes nothing, so it is safe to fire at anything. | paragraph |
| Game key | field label |
| "nhl" is whichever season is current; a number pins a past one | inline text |
| League key | field label |
| e.g. 465.l.12345 | placeholder on `<input>` |
| Asks that league's players instead of the whole game's | inline text |
| Season | field label |
| e.g. 2025 | placeholder on `<input>` |
| Start year. Leave empty to send no season filter at all | inline text |
| {{ probing() ? 'Asking Yahoo…' : 'Run probe' }} | button, filled in at runtime |
| Can we list our leagues? | button |
| The second button ignores the fields above and asks the simplest question there is: will Yahoo list this account's own leagues? That is the floor. If even that is refused, no route into the Fantasy API is open to us, and no choice of endpoint will help. | paragraph |
| The service account's leagues | paragraph |
| {{ league.leagueKey }} | button, filled in at runtime |
| {{ league.name }} | inline text, filled in at runtime |
| {{ league.season }} | inline text, filled in at runtime |
| {{ leaguesError() }} | paragraph, filled in at runtime |
| {{ probeError() }} | paragraph, filled in at runtime |
| ● Yahoo served it | inline text |
| ({{ result.players }} {{ result.players === 1 ? 'player' : 'players' }} on the first page). | paragraph |
| ● Refused | inline text |
| (HTTP {{ result.status }}) | paragraph |
| {{ result.error }} | paragraph, filled in at runtime |
| {{ result.path }} | paragraph, filled in at runtime |

**`src/app/admin/admin.ts`**

| Text | Where |
| --- | --- |
| Yahoo sent no authorization code back. The consent was declined or cancelled. | in code |
| The connection link had expired before Yahoo sent you back. Press reconnect and approve it | in code |
| without pausing. The link is good for ten minutes. | in code |
| Yahoo refused to exchange the code for a token. That is Yahoo turning us away, not a | in code |
| mis-click. Check the app registration and its Fantasy Sports permission. | in code |
| Yahoo calls it a declined request. | in code |
| Yahoo rejected the fspt-r scope outright. This app is no longer allowed to ask for | in code |
| Fantasy Sports data. Retrying will not help. | in code |
| Yahoo does not accept this app for this flow. Check the client type and its API | in code |
| permissions. Retrying will not help. | in code |
| Yahoo called the request itself malformed. | in code |
| Yahoo rejected the response type the app asked for. | in code |
| Yahoo reported a fault on its own side, so this one is worth simply retrying. | in code |
| Yahoo says it is temporarily unavailable, so this is worth retrying. | in code |
| Yahoo did not complete the connection, and did not say why. | in code |
| Yahoo account connected. | in code |
| Yahoo would not list the service account's leagues. | in code |
| Could not load the Yahoo connection status. | in code |
| Could not start the Yahoo connection. | in code |
| Could not reach the probe itself. That is our side, not Yahoo. | in code |
| Sync started, waiting for the result… | in code |
| Could not start the sync. | in code |
| Sync is taking longer than expected. Use Refresh to check. | in code |
## Appendix A — text the server writes that a reader sees

Everything above lives in `fantasy-web`. These three do not, and they still reach people.

### The link preview for a shared projection

`fantasy-bff` · `SharedProjectionController`. nginx routes link-preview crawlers for `/s/*`
here instead of to the app, because they run no JavaScript. This is what Slack, Discord,
iMessage and X show when someone posts a share link, so for most people it is the first
SlapStat copy they ever read.

| Text | Where |
| --- | --- |
| `{projection name}` — a fantasy hockey projection on SlapStat | `<title>`, `og:title` and `twitter:title` |
| `{author}`'s player rankings for the upcoming NHL season, tuned to their league's scoring settings. Top of the board: `{first players}`. | `og:description`, `twitter:description` and the meta description |
| `{author}`'s player rankings for the upcoming NHL season, tuned to their league's scoring settings. | the same, for a board with no rows to name |
| SlapStat | `og:site_name` |
| View this projection on SlapStat | the body of the page, seen only by a crawler that ignores the redirect |

Note the em dash in the title. It is server-side, so it sits outside the web's copy rules,
but it is read by more people than most lines in this file.

### The preview image

`fantasy-bff` · `ShareCardRenderer`, served at `/s/{token}/og-image.png` and drawn into the
card above.

| Text | Where |
| --- | --- |
| SLAPSTAT · `{season}` | top left of the card |
| `{projection name}` | the card's headline |
| by `{author}` · Points league | the line under it |
| by `{author}` · Category league | the same, for a category league |
| by `{author}` · `{scoring}` · `{n}` teams | the same, where the league size is known |
| Fan Pts | the value column's heading, points leagues |
| Z-Score | the value column's heading, category leagues |
| slapstat.com | bottom left |
| Data © MoneyPuck.com and the NHL | bottom right |

### Emails

`fantasy-bff` · `ResendEmailVerificationEmailSender` and `ResendPasswordResetEmailSender`.
Sent through Resend. Both have a plain-text and an HTML body that say the same thing.

**From:** `SlapStat <no-reply@slapstat.com>`

| Text | Where |
| --- | --- |
| Verify your SlapStat email | subject |
| Welcome to SlapStat! Please confirm your email address. | first line |
| Open this link to verify (expires in about `{n}` hours): | plain-text body |
| Verify your email | the link's text in the HTML body |
| (expires in about `{n}` hours). | after the link, HTML body |
| If you didn't create a SlapStat account, you can safely ignore this email. | last line |
| Reset your SlapStat password | subject |
| We received a request to reset your SlapStat password. | first line |
| Open this link to choose a new password (expires in about `{n}` minutes): | plain-text body |
| Choose a new password | the link's text in the HTML body |
| (expires in about `{n}` minutes). | after the link, HTML body |
| If you didn't request this, you can safely ignore this email. | last line |

## Appendix B — what is missing, and where to look next

Two gaps worth knowing about rather than guessing at:

- **Downstream error wording.** The web replaces nearly every server error with its own
  message, which is why they are all in the sections above. Two exceptions show a
  third party's own words: the admin Yahoo probe (Yahoo's refusal, verbatim, admin only) and
  the ESPN sync, whose failures are mapped to the messages listed under League sync.
- **Player and team names** come from Yahoo's player pool and are not copy anyone here
  writes. Neither are stat values, dates or currency, all of which are formatted by the
  browser's locale.
