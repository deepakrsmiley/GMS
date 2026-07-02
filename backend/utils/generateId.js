const generatePatientId = (counter) => {
  const year = new Date().getFullYear().toString().slice(-2);
  const num = String(counter).padStart(6, '0');
  return `PT${year}${num}`;
};

const generateBillNo = (counter) => {
  const year = new Date().getFullYear().toString().slice(-2);
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const num = String(counter).padStart(5, '0');
  return `BILL${year}${month}${num}`;
};

const generateTokenNo = (counter) => String(counter).padStart(3, '0');

const generateLabNo = (counter) => {
  const year = new Date().getFullYear().toString().slice(-2);
  const num = String(counter).padStart(5, '0');
  return `LAB${year}${num}`;
};

const generateAdmissionNo = (counter) => {
  const year = new Date().getFullYear().toString().slice(-2);
  const num = String(counter).padStart(5, '0');
  return `IP${year}${num}`;
};

module.exports = { generatePatientId, generateBillNo, generateTokenNo, generateLabNo, generateAdmissionNo };
