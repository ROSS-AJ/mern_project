// Where the editor's back button goes: the dashboard, for projects opened
// from it, or the editor's own home screen (upload a score / continue).
//
// Kept per tab in sessionStorage, so reloading the editor still knows. The
// dashboard opens projects with /editor/?project=<id>, and hands over big
// files with /editor/?continue&from=dashboard; both mark the dashboard here.

export type ReturnTo = 'dashboard' | 'home';

const KEY = 'partwise-return-to';

export function setReturnTo(place: ReturnTo): void {
  try {
    if (place === 'dashboard') sessionStorage.setItem(KEY, place);
    else sessionStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the back button goes home.
  }
}

export function returnTo(): ReturnTo {
  try {
    return sessionStorage.getItem(KEY) === 'dashboard' ? 'dashboard' : 'home';
  } catch {
    return 'home';
  }
}
