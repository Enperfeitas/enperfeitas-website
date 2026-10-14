# Setting up the bidding tool

This guide is written for someone who does not write code. Take it one step at a time. Nothing here can break your website, because the bidding lives on a separate page (bidding.html) that is not in the menu and is not shown to search engines.

## How it fits together

- **A Google Sheet** holds the people you invite, the bids and the settings.
- **A small script** (Code.gs) lives inside that Sheet. It is the only place where the rules are kept: who may bid, how much, when bidding closes. The web page cannot change any rule.
- **The page** (bidding.html) shows the piece, the high bid, a countdown and a bid form. It asks the script for everything.

All amounts are whole Swedish kronor (SEK) and include moms.

## Before you start: TODO list

Fill these in before the real round. The test round can be done without them.

- [ ] Piece details: title, photos in the images/bidding folder, a short description, and the size and materials (see "Adding a piece" below). These now live in the Config tab, so you do not edit the page.
- [ ] Opening bid (your floor price) and the minimum step. The step starts at 100 SEK.
- [ ] Terms wording on the page and in the invitation email, including the 14 day right of withdrawal. Please check with Konsumentverket what applies to a bid on a made-to-order or one-off piece, and what the page and your invoice must say. The page currently has a placeholder line about this.
- [ ] Sign-up form link: put the real Google Form link in js/bidding.js (SIGNUP_FORM_URL).
- [ ] Closing date and time, written with the Swedish time zone offset (see Step 4).
- [ ] The wording of the invitation email in Code.gs (function buildInvitationBody_). It is plain English and easy to adjust.
- [ ] The sign-up Form's consent line, and how long you will keep the Sheet with names and emails.
- [ ] Decide what happens if the winner does not pay within 48 hours (the page says the piece is offered to the next bidder).
- [ ] Run the full test round (Step 7) and tick every box in the test checklist.
- [ ] Switch test_mode off (Step 8) and only then send real invitations.
- [ ] Merge the bidding-tool branch into main when you are ready for the page to be public.

## Step 1: The Sheet and the Form

1. Open the Google Form you use for sign-ups. Go to the **Responses** tab and click **Link to Sheets**. Create a new spreadsheet (or choose an existing one). This is your Sheet.
2. In the Sheet, the tab with the responses is usually called "Form Responses 1". **Rename it to exactly `Invitees`** (right-click the tab, Rename).
3. In the Invitees tab, find the first empty column to the right of your Form questions. In the top row, type these three headings, one per column, in this order:
   - `status`
   - `code`
   - `sent`
4. The script finds your columns by their headings. So the Form needs a question called **First name** and one called **Email** (or very similar, such as "Email address"). The other questions (Instagram handle, what the book would be for, budget range, consent) are only for you to read.

How you use the status column: when someone signs up, the status cell is empty, which counts as pending. When you decide to invite them, type `approved`. If you need to stop someone from bidding, type `revoked`.

## Step 2: Paste the script

1. In the Sheet, open **Extensions > Apps Script**. A new tab opens.
2. You will see a file called Code.gs with a few lines in it. Select everything in it and delete it.
3. Open the file `apps-script/Code.gs` from this repository, copy all of it, and paste it in.
4. Click the disk icon (Save). If it asks for a project name, call it "Bidding".
5. Go back to the Sheet tab and reload the page (F5). After a few seconds a new menu called **Invitations** appears next to Help.

## Step 3: Create the Bids and Config tabs

1. In the Sheet, choose **Invitations > Create Bids and Config tabs (first time only)**.
2. The first time, Google asks for permission. Click Continue, choose your account, and if you see "Google hasn't verified this app", click **Advanced** and then **Go to Bidding (unsafe)**. This is normal for your own script. Click **Allow**. The script needs to read and write the Sheet, and to send email from your account.
3. Run the menu item again if nothing happened the first time. You should now have two new tabs: **Bids** and **Config**.

## Step 4: Fill in the Config tab

Column A holds the name of each setting. Column B holds the value. Do not rename column A. Click each value and change it.

| Setting | What to write |
|---|---|
| piece_title | The name of the piece, for example "The Blue Book". |
| opening_bid | The first bid must be at least this many SEK. This is your floor price. |
| min_step | How much higher each new bid must be than the last one. 100 is the default. |
| start_time | Optional. When bidding opens, written the same way as closing_time, for example `2026-10-30T18:00:00+01:00`. Before this moment the page shows the piece and a countdown to the opening, with no bid form, and the script refuses bids. At the moment it passes, bidding opens by itself, with nothing for you to switch on. Leave it empty to open bidding at once. If it is by mistake later than closing_time, it is ignored. |
| closing_time | When bidding ends, written like `2026-11-01T20:00:00+01:00`. The part after the plus sign is the Swedish time offset: `+01:00` in winter and `+02:00` in summer. Swedish clocks change on the last Sunday of March and of October, so check which applies on your closing day. |
| extension_minutes | 5 by default. A bid in the last 5 minutes moves the closing time to 5 minutes after that bid. |
| status | `open` while bidding runs. The menu item "Close auction" changes it to `closed`. |
| test_mode | `TRUE` while you test. `FALSE` for the real round. |
| page_base_url | The address of the bidding page, for example `https://enperfeitas.com/bidding.html`. |
| photo_prefix | The start of your photo file names, for example `beige-jeand-de-g`. The page looks in the images/bidding folder for `beige-jeand-de-g-1.webp`, `beige-jeand-de-g-2.webp` and so on. Lowercase letters, numbers and hyphens only. Spaces become hyphens. |
| photo_count | How many photos there are, for example 4. If you leave this empty, the page counts them by itself (up to 8). The most it will show is 12. |
| photo_alt | One plain sentence describing the photos, for example "Beige linen book with a mustard leather spine". It is read aloud for people who use a screen reader. |
| description | Two or three plain sentences about the piece. Press Alt+Enter (Windows) or Option+Enter (Mac) inside the cell to start a new paragraph. Leave empty to show no description. |
| details | One fact per line, written as `Label: value`, for example `Size: 20 x 13 cm`. Press Alt+Enter between lines. Lines without a value are left out, so you can keep the labels and fill them in later. |
| reply_by | Optional. If you write a time here, the invitation email adds the line "If you have not received this by [that time], reply to this email." Leave it empty to leave the line out. |

Tip: if the closing_time cell turns into a date by itself, select the cell, choose Format > Number > Plain text, and type it again. The script handles both, but plain text is the safest.

## Adding a piece: photos, description and details

Everything about the piece is set in the Config tab. You do not edit the page.

1. **Prepare the photos.** Save each as `.webp` (or ask Claude to convert them), about 1200 pixels on the long side, and under 300 KB. Portrait photos in a 4 to 5 shape look best.
2. **Name them** with the piece name first, then a number, for example `beige-jeand-de-g-1.webp`, `beige-jeand-de-g-2.webp`. Number 1 is the main photo. Use lowercase letters, numbers and hyphens only.
3. **Put them in the folder `images/bidding`** in the website folder, and publish them (commit, push, merge) like any other change.
4. **In the Config tab,** write the name part (`beige-jeand-de-g`) in `photo_prefix`, the number of photos in `photo_count`, a plain sentence in `photo_alt`, and fill in `description` and `details`.
5. Reload the bidding page. The main photo, a row of small photos to click, the text and the facts appear. Changes in the Config tab show up within a few seconds, with no need to change the website.

For the next piece, add its photos to the same folder with a different name, then change the Config values. If a photo cannot be found, the page simply hides the photo area. It does not show an error.

If your Config tab was created before this feature existed, choose **Invitations > Create Bids and Config tabs (first time only)** once. It adds the missing rows and does not change anything you already wrote.

## Step 5: Publish the script as a web app

1. In the Apps Script tab, click **Deploy > New deployment**.
2. Click the small gear next to "Select type" and choose **Web app**.
3. Set **Execute as** to **Me**.
4. Set **Who has access** to **Anyone**. This lets the page talk to the script. Nobody can do anything without a valid personal code, and the rules are enforced inside the script.
5. Click **Deploy**. Copy the **Web app URL**. It ends in `/exec`.

Important: if you ever change Code.gs later, go to **Deploy > Manage deployments**, click the pencil, choose **New version**, and click Deploy. Saving alone does not update the published version.

## Step 6: Put the web app URL into the page

1. Open `js/bidding.js` in this repository.
2. Near the top, find the line `var WEB_APP_URL = '';`
3. Paste your URL between the quotation marks, so it looks like `var WEB_APP_URL = 'https://script.google.com/macros/s/.../exec';`
4. Save, and commit the change on the bidding-tool branch.

While that line is empty, the page runs in demo mode: it shows example figures and sends nothing. That is useful for looking at the design.

### How to preview the page

The branch is not merged, so the public website does not show it. To look at it on your computer:

1. In GitHub Desktop, make sure the current branch is **bidding-tool**.
2. Choose **Repository > Show in Explorer**, and double-click `bidding.html`. It opens in your browser.
3. With no web app URL, you see the demo view. Add `?code=ANYTHING` to the address to see the bidding form in demo mode, `?code=BADCODE` to see how an invalid code looks, and `?demo=closed` to see the closed state.
4. Once the web app URL is in place, the same file talks to your real Sheet, so you can run the full test in Step 7 without publishing anything.

## Step 7: A full test with test_mode on

Keep test_mode on `TRUE` for all of this. In test mode, invitation emails go only to your own address.

1. In the Invitees tab, add two or three test rows by hand: a first name, your own email address (you can reuse it), and `approved` in the status column. Give two of the rows the same first name, to see how the page tells them apart.
2. Choose **Invitations > Generate codes**. Each approved row gets a code of 7 letters and numbers.
3. Choose **Invitations > Send invitations**. You receive one test email per row, each marked [TEST], at your own address. Open one and read it through. The email is designed (a clear heading, a button to open your bidding page, the dates in a small box, and the steps as a short list). A plain text version is sent along for mail apps that do not show designed emails. Check it on your phone as well.
4. Click the personal link in an email. The page opens with a bid form. The code disappears from the address bar and is kept for this browser visit.
5. Use two different browsers, or a private window, to act as two different people. Place bids back and forth.
6. When you are done, choose **Invitations > Reset test bids**. This empties the Bids tab. It only works while test_mode is TRUE.

### Test checklist

Tick each one.

- [ ] **Invalid code:** open the page with a made-up code, for example `?code=ABCDEFG`. The page shows the read-only view and says the code was not recognised. No bid form.
- [ ] **No code:** open the page with no code. Read-only, a note that bidding is for invited people, and a sign-up link.
- [ ] **Low bid:** try a bid below the minimum. The page says what the minimum is, and nothing is added to the Bids tab.
- [ ] **Whole numbers only:** try 1500.50 and a word. Both are refused with a clear message.
- [ ] **Own-bid block:** after you place a bid, try to bid again as the same person. The form is disabled and the page says you hold the highest bid. A different person can bid, and then you can bid again.
- [ ] **Minimum step:** with a high bid of 1000, a bid of 1050 is refused and a bid of 1100 is accepted.
- [ ] **Confirmation:** the page asks you to confirm before a bid is sent, and "Change amount" takes you back.
- [ ] **Start time:** set start_time to about 3 minutes from now, with test_mode on. The page shows "Opens in" with a countdown and no bid form, and a bid sent early is refused. When the countdown reaches zero, the form appears on its own within a few seconds and a short note says bidding is now open. Clear start_time afterwards if you want bidding open at once.
- [ ] **Closing extension:** set closing_time to about 3 minutes from now. Place a bid. In the Config tab, closing_time moves to 5 minutes after your bid, and the page says the closing time moved.
- [ ] **Closed state:** set closing_time to a moment in the past (or use Invitations > Close auction). The page shows the final result and no form. A bid sent by other means is refused.
- [ ] **Revoked code:** change one person's status to `revoked`. Their link now shows the read-only view with a note that the invitation is no longer active, and any bid is refused.
- [ ] **Display names:** two people with the same first name appear as, for example, Anna 1 and Anna 2. Nobody's email, code or Instagram handle appears anywhere on the page.
- [ ] **Live updates:** with the page open on one screen, place a bid from another. The first screen updates within about 5 seconds.
- [ ] **Connection lost:** switch off Wi-Fi for a few seconds. A quiet "Connection lost, retrying" note appears, then disappears when the connection returns.
- [ ] **Phone:** open the link on your phone. Everything is readable and the buttons are easy to press.
- [ ] **Emails:** the test emails arrive, read well, and show the closing time in Swedish time.

After testing: choose **Invitations > Reset test bids**, then set closing_time and status in Config again, because a test may have moved the closing time or closed the auction.

## Changing the wording of the invitation email

The wording is kept in three short places in `Code.gs`, near the function `buildInvitationHtml_`. You can change a sentence without touching the design.

- `invitationSteps_`: the numbered steps under "How bidding works".
- `invitationAfterWinning_`: the points under "If you win" (invoice, payment, shipping, withdrawal).
- `INVITATION_LINK_NOTE`: the sentence under the button.

The email uses the Enperfeitas logo from `images/email/logo.png` on the website, and the site fonts (Roboto Slab and Roboto) where the mail app can load them. Gmail and Outlook cannot load web fonts, so they show the closest font on the reader's device instead (Rockwell or Georgia for headings, Arial for text). That is a limit of email, not of the design. Apple Mail and the iPhone mail app show the exact fonts. In test mode the grey banner at the top of the email ends with "Layout version 4". If your test email does not say that, your Sheet is still running an older copy of the script: paste the latest Code.gs and publish a new version. The logo appears once the image is published on the website.

Keep each sentence between the quotation marks, and keep the commas at the end of each line. After a change, publish a new version of the web app (Step 5), then run a test send to yourself.

## Step 8: The real round


1. Check Config: piece_title, opening_bid, min_step, start_time (optional) and a real closing_time, extension_minutes, status `open`, and page_base_url. Keep status on `open`, even before the start time: the start time does the waiting.
2. Choose **Invitations > Reset test bids** one last time so the Bids tab is empty. This only works while test_mode is still TRUE.
3. Change **test_mode to FALSE**. From now on, emails go to the invitees.
4. In the Invitees tab, type `approved` for each person you want to invite.
5. Choose **Invitations > Generate codes**, then **Invitations > Send invitations**. Each person gets one personal email, and the sent column is filled in with the time.
6. Merge the bidding-tool branch into main so that the page is public (or ask someone to help with this).

Email limits: a free Gmail account can send about 100 emails a day, and Google Workspace about 1500. The script checks your remaining allowance before it sends and stops with a message if it is too low. Nothing is sent in that case, and you can run it again the next day.

## While bidding is open

- **Stop one person from bidding:** change their status to `revoked`.
- **Cancel a single bid:** in the Bids tab, type `TRUE` in the void column of that row. It is ignored from then on.
- **Close early:** Invitations > Close auction.
- **Everything bound:** every bid is binding and there is no way for a bidder to withdraw. That is part of the rules shown on the page.

## After bidding closes

The page shows the final result. The winner is the name on the highest line of the Bids tab. Look up that person's email in the Invitees tab (the code in the Bids tab matches the code in the Invitees tab). The page tells bidders that the winner is invoiced within 24 hours and pays within 48 hours, otherwise the piece is offered to the next bidder. Delete or archive the Sheet when you no longer need the names and emails.

## If something looks wrong

- **The page shows "Demo view":** the web app URL in js/bidding.js is empty.
- **"Connection lost, retrying" stays on screen:** the web app URL may be wrong, or the deployment is not set to "Anyone". Open the URL in a browser tab. You should see some text starting with `{`.
- **A change to Code.gs has no effect:** publish a new version (Step 5, the Important note).
- **The email says the wrong time:** check the offset in closing_time (+01:00 in winter, +02:00 in summer).
- **Codes look cut off or odd in the Sheet:** the code column should be plain text. Select the column, then Format > Number > Plain text.
- **A person did not get their email:** check the status is `approved`, the code and email cells are filled in, and the sent cell is empty. Then run Send invitations again.

## What is in this folder

- `Code.gs`: the script to paste into the Sheet.
- `SETUP.md`: this guide.
- The page itself is `bidding.html` in the main folder, with `css/bidding.css` and `js/bidding.js`.
