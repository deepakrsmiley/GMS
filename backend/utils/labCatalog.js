/** Expand hospital TestMaster group/single catalog into lab order rows. */

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findMaster = (masters, name) => {
  const want = String(name || '').trim().toLowerCase();
  if (!want) return null;
  return (masters || []).find((m) => String(m.name || '').trim().toLowerCase() === want) || null;
};

const masterHasGroupFormat = (master) =>
  !!master && (master.kind === 'group' || (Array.isArray(master.items) && master.items.length > 0));

const collectProfilePrices = (profileNames, masters, clientTests = [], extraPrices = {}) => {
  const prices = { ...extraPrices };
  (clientTests || []).forEach((t) => {
    const key = t.profileName || t.testName;
    const p = Number(t.price) || 0;
    if (key && p > 0) prices[key] = (Number(prices[key]) || 0) + p;
  });
  (profileNames || []).forEach((name) => {
    if (prices[name] != null && prices[name] !== '') return;
    const master = findMaster(masters, name);
    if (master) prices[name] = Number(master.price) || 0;
  });
  return prices;
};

const rowsFromMaster = (master) => {
  if (masterHasGroupFormat(master)) {
    return [...(master.items || [])]
      .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
      .map((item) => ({
        testName: item.testName,
        unit: item.unit || '',
        normalRange: item.normalRange || '',
        method: item.method || '',
        isSection: !!item.isSection,
      }));
  }
  return [{
    testName: master.name,
    unit: master.unit || '',
    normalRange: master.normalRange || '',
    method: master.method || '',
    isSection: false,
  }];
};

const expandRows = (profileName, rows, price) => {
  const amount = Number(price) || 0;
  const pricedIndex = rows.findIndex((row) => !row.isSection);
  const billIndex = pricedIndex < 0 ? 0 : pricedIndex;
  return rows.map((row, idx) => ({
    testName: row.testName,
    profileName,
    price: idx === billIndex ? amount : 0,
    unit: row.unit || '',
    normalRange: row.normalRange || '',
    method: row.method || '',
    isSection: !!row.isSection,
  }));
};

/**
 * Expand selected profile names.
 * Group masters (kind=group / items) always expand from TestMaster.
 * Other names keep client-sent tests so Sri Sanjeevi hardcoded packages stay intact.
 */
const expandLabOrderTests = (profileNames, masters, priceByProfile = {}, clientTests = []) => {
  const names = (profileNames || []).map((n) => String(n || '').trim()).filter(Boolean);
  const tests = [];
  let totalAmount = 0;

  names.forEach((name) => {
    const master = findMaster(masters, name);
    const price = Number(priceByProfile[name] ?? master?.price) || 0;
    const importedSingle = master && master.kind === 'single' && master.testCode;
    if (masterHasGroupFormat(master) || importedSingle) {
      const rows = rowsFromMaster(master);
      const expanded = expandRows(name, rows, price);
      tests.push(...expanded);
      totalAmount += price;
      return;
    }
    const existing = (clientTests || []).filter((t) => {
      const profile = String(t.profileName || '').trim();
      return profile === name || (!profile && String(t.testName || '').trim() === name);
    });
    if (existing.length) {
      tests.push(...existing);
      totalAmount += existing.reduce((sum, t) => sum + (Number(t.price) || 0), 0);
    } else {
      tests.push({ testName: name, profileName: name, price, unit: '', normalRange: '', method: '', isSection: false });
      totalAmount += price;
    }
  });

  return { tests, totalAmount };
};

module.exports = {
  escapeRegex,
  findMaster,
  masterHasGroupFormat,
  collectProfilePrices,
  expandLabOrderTests,
};
