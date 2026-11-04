import {
  LAB_PROFILES,
  LAB_TYPES,
  OTHER_PROFILE,
  expandProfilesToTests,
  getProfileMeta,
  findMatchingProfile,
  buildOtherLabTests,
  profilesForTypeWithOther,
  LAB_PROFILE_OPTIONS,
} from '../constants/labProfiles';

const mapParameter = (item) => ({
  testName: item.testName,
  unit: item.unit || '',
  normalRange: item.normalRange || '',
  method: item.method || '',
  isSection: !!item.isSection,
});

/** Built-in package rows when Test Master has a price but no child list. */
const builtinTests = (name) => {
  const want = String(name || '').trim().toLowerCase();
  if (!want) return [];
  const key = Object.keys(LAB_PROFILES).find((n) => n.toLowerCase() === want);
  const profile = key ? LAB_PROFILES[key] : null;
  if (!profile || Array.isArray(profile)) return [];
  return (profile.tests || []).map(mapParameter);
};

const parameterCount = (tests = []) => tests.filter((row) => row?.testName && !row.isSection).length;

export function catalogMapFromTestMaster(testMaster = []) {
  const imported = (testMaster || []).some(
    (t) => t.kind === 'group' || (Array.isArray(t.items) && t.items.length),
  );
  if (!imported) return null;
  const map = {};
  (testMaster || []).forEach((t) => {
    if (t.isActive === false) return;
    const isGroup = t.kind === 'group';
    const stored = isGroup && t.items?.length
      ? [...t.items]
        .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
        .map(mapParameter)
        .filter((item) => item.testName)
      : [];
    const fallback = stored.length ? [] : builtinTests(t.name);
    const tests = stored.length
      ? stored
      : (fallback.length
        ? fallback
        : [{
            testName: t.name,
            unit: t.unit || '',
            normalRange: t.normalRange || '',
            method: t.method || '',
          }]);
    map[t.name] = {
      labType: t.category || 'Other',
      sampleType: t.sampleType || 'blood',
      kind: isGroup || parameterCount(tests) > 1 ? 'group' : 'single',
      tests,
    };
  });
  return map;
}

export function labCatalogFromMaster(testMaster = []) {
  const hospital = catalogMapFromTestMaster(testMaster);
  const catalog = hospital || LAB_PROFILES;
  const usingHospitalCatalog = !!hospital;

  const orderable = (labType) => {
    if (!usingHospitalCatalog) {
      if (labType === 'Other') return [];
      if (labType) return profilesForTypeWithOther(labType).filter((n) => n !== OTHER_PROFILE);
      return LAB_PROFILE_OPTIONS.filter((n) => n !== OTHER_PROFILE && n !== 'Custom / Manual');
    }
    const rows = (testMaster || []).filter((t) => t.isActive !== false);
    const groups = rows.filter((t) => t.kind === 'group');
    const singles = rows.filter((t) => t.kind !== 'group' && Number(t.price) > 0);
    return [...groups, ...singles]
      .filter((t) => !labType || labType === 'Other' || t.category === labType)
      .map((t) => t.name);
  };

  const labTypes = usingHospitalCatalog
    ? LAB_TYPES.filter((t) => (
      t === 'Other'
      || (testMaster || []).some((x) => x.isActive !== false && x.category === t && (x.kind === 'group' || Number(x.price) > 0))
    ))
    : LAB_TYPES;

  const priceMap = Object.fromEntries((testMaster || []).map((t) => [t.name, t.price]));

  const byName = Object.fromEntries((testMaster || []).map((t) => [t.name, t]));

  const list = (kind) => {
    if (usingHospitalCatalog) {
      return (testMaster || [])
        .filter((t) => t.isActive !== false)
        .filter((t) => {
          const tests = catalog[t.name]?.tests || [];
          const packaged = t.kind === 'group' || parameterCount(tests) > 1;
          if (kind === 'group') return packaged;
          return t.kind !== 'group' && Number(t.price) > 0;
        })
        .map((t) => {
          const tests = catalog[t.name]?.tests || [];
          return {
            name: t.name,
            testCode: t.testCode || '',
            kind: t.kind === 'group' || parameterCount(tests) > 1 ? 'group' : 'single',
            price: Number(t.price) || 0,
            category: t.category || 'Other',
            sampleType: t.sampleType || 'blood',
            tests,
          };
        })
        .sort((a, b) => String(a.testCode || a.name).localeCompare(String(b.testCode || b.name)));
    }
    if (kind === 'group') {
      return LAB_PROFILE_OPTIONS
        .filter((n) => n !== OTHER_PROFILE && n !== 'Custom / Manual')
        .map((name) => {
          const meta = LAB_PROFILES[name] || {};
          return {
            name,
            testCode: '',
            kind: 'group',
            price: Number(priceMap[name]) || 0,
            category: meta.labType || 'Other',
            sampleType: meta.sampleType || 'blood',
            tests: meta.tests || [],
          };
        })
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    }
    return (testMaster || [])
      .filter((t) => t.isActive !== false && !LAB_PROFILES[t.name] && Number(t.price) > 0)
      .map((t) => ({
        name: t.name,
        testCode: t.testCode || '',
        kind: 'single',
        price: Number(t.price) || 0,
        category: t.category || 'Other',
        sampleType: t.sampleType || 'blood',
        tests: catalog[t.name]?.tests || [{ testName: t.name }],
      }))
      .sort((a, b) => String(a.testCode || a.name).localeCompare(String(b.testCode || b.name)));
  };

  return {
    usingHospitalCatalog,
    catalog,
    labTypes,
    orderable,
    priceMap,
    byName,
    list,
    getMeta: (name) => getProfileMeta(name, catalog),
    expand: (names, prices) => expandProfilesToTests(names, prices, catalog),
    findMatch: (q) => findMatchingProfile(q, catalog),
    buildOther: (name, price) => buildOtherLabTests(name, price, { priceMap, testMaster, catalog }),
    kindOf: (name) => getProfileMeta(name, catalog)?.kind || 'single',
  };
}
