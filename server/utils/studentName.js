// "First Middle (Nickname) Last": the middle name and the nickname are each
// optional and simply left out when blank.
function fullName(student) {
  const middle = (student.middleName || '').trim();
  const nickname = (student.nickname || '').trim();
  return [student.firstName, middle, nickname && `(${nickname})`, student.lastName].filter(Boolean).join(' ');
}

module.exports = { fullName };
