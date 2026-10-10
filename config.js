// The ONLY file you need to edit if the Apps Script link ever changes.
window.IM_CONFIG = {
  // Apps Script web app link (Deploy > Manage deployments > Web app URL). Must end in /exec and must NOT contain /u/0/, /u/1/ …
  execUrl: 'https://script.google.com/macros/s/AKfycbx1B64ae-1B1TKG4syB5wOqbzqBkkAV9flr7tgWLl0IMJ-87e6Ae1vnRZHK-zDDfRSo/exec',
  // true = open the app without the phone's Google accounts (fixes "Sorry, unable to open the file" on phones
  // signed in to several Google accounts). Logins are remembered by this wrapper instead.
  credentialless: true,
  // Pages allowed to hand a login token to this wrapper (Apps Script serves the app from *.googleusercontent.com).
  appOriginPattern: '^https://[a-z0-9-]+-script\\.googleusercontent\\.com$'
};
