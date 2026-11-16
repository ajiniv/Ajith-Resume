# Expense Tracker (iPhone web app)

An installable web app for tracking spending: monthly and yearly totals, a
breakdown by category, your own categories, multiple currencies, and
email + password accounts.

No build step. It is plain HTML, CSS and JavaScript.

## Put it on your iPhone

1. Host this folder over HTTPS. With GitHub Pages: repository **Settings → Pages →
   Deploy from a branch**, pick the branch that contains this folder. The app is then at
   `https://<your-username>.github.io/<repository>/expense-tracker/`.
2. Open that address in **Safari** on the iPhone.
3. Tap **Share → Add to Home Screen**. It now opens full-screen like any other app.

## Connect Firebase (so data follows the email account)

Until this is done the app runs in **demo mode**: accounts and expenses are kept
on that one device only.

1. Go to <https://console.firebase.google.com>, **Add project** (free "Spark" plan is enough).
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable**.
3. **Build → Firestore Database → Create database** (production mode, any region).
4. In Firestore, open the **Rules** tab, paste the rules below and **Publish**. They let
   each signed-in user read and write only their own data:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

5. **Project settings (gear icon) → Your apps → Web (`</>`)**, register an app, and copy
   the `firebaseConfig` values into `firebase-config.js` in this folder.
6. **Authentication → Settings → Authorized domains**: add the domain you host on
   (for example `<your-username>.github.io`).

The values in `firebase-config.js` are not secrets; the Firestore rules are what
protect the data.

## Where the data lives

Each account's data is stored under `users/<user id>/` in Firestore:
`expenses`, `categories` and `meta/settings`. Signing in with the same email on
another phone or computer shows the same data.

## Currencies

Every expense keeps the amount and currency it was entered in. The **View in**
selector converts totals to any other currency using current exchange rates from
open.er-api.com (refreshed about twice a day), so converted figures are approximate.

## Try it on a computer

```
python3 -m http.server 8000
```

then open <http://localhost:8000/expense-tracker/> (run from the repository root).
