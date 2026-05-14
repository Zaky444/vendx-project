function now() {
  return Date.now();
}

function minutesFromNow(minutes) {
  return now() + minutes * 60 * 1000;
}

module.exports = {
  now,
  minutesFromNow
};
