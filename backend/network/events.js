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
// Lightweight event bus for the network layer -> local layer hand-off.

const { EventEmitter } = require("events");
const bus = new EventEmitter();

// Cap listener leak warnings during development.
bus.setMaxListeners(50);

module.exports = bus;
