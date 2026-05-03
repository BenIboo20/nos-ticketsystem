function formatDateTime(dateInput) {
  const date = new Date(dateInput);
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function diffMinutes(from, to = Date.now()) {
  return Math.max(0, Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 60000));
}

function humanDurationFromMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours <= 0) {
    return `${mins} dakika`;
  }

  if (mins === 0) {
    return `${hours} saat`;
  }

  return `${hours} saat ${mins} dakika`;
}

function relativeMinutesLabel(dateInput) {
  const minutes = diffMinutes(dateInput);
  if (minutes <= 0) {
    return "Az önce";
  }

  return `${minutes} dakika önce`;
}

function futureMinutesLabel(msRemaining) {
  const minutes = Math.max(0, Math.ceil(msRemaining / 60000));
  return `${minutes} dakika`;
}

module.exports = {
  diffMinutes,
  formatDateTime,
  futureMinutesLabel,
  humanDurationFromMinutes,
  relativeMinutesLabel,
};
