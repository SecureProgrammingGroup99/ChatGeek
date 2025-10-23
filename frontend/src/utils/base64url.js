/*
  ChatGeek - Secure Programming Coursework
  Group: Group 99
  Members:
    - Finlay Bunt (Student ID: a1899706)
    - Akash Sapra (Student ID: a1941012)
    - Aditya Yadav (Student ID: a1961476)
    - Josh Harish (Student ID: a1886175)
    - Michelle Ngoc Bao Nguyen (Student ID: a1894969)
*/
export const b64u = {
  enc: (bytes) =>
    btoa(String.fromCharCode(...bytes))
      .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''),
  dec: (s) =>
    new Uint8Array(atob(s.replace(/-/g,'+').replace(/_/g,'/'))
      .split('').map(c => c.charCodeAt(0))),
};
