import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, Beaker, Pill, Users, Clock3,
  Volume2, Megaphone, Stethoscope, Globe, Wifi, WifiOff,
} from 'lucide-react';
import { useSelector } from 'react-redux';
import api from '../services/api';
import { useBranding } from '../hooks/useBranding';
import { initSocket } from '../services/socket';
import { istCalendarDate } from '../utils/istDate';
import '../styles/tvQueueDisplay.css';

// ────────────────────────────────────────────────────────────────────────────
// Data hooks — every number on this screen comes from the live HMS database.
// ────────────────────────────────────────────────────────────────────────────

function useOpQueue() {
  const date = istCalendarDate();
  return useQuery({
    queryKey: ['tv-op-queue', date],
    queryFn: () => api.get('/op/queue', { params: { date } }).then((r) => r.data),
    refetchInterval: 20000,
  });
}

function useLabQueue() {
  return useQuery({
    queryKey: ['tv-lab-queue'],
    queryFn: () => api.get('/lab', { params: { limit: 30, sort: '-createdAt' } }).then((r) => r.data),
    refetchInterval: 20000,
  });
}

function usePharmacyQueue() {
  return useQuery({
    queryKey: ['tv-pharmacy-queue'],
    queryFn: () => api.get('/op/pharmacy-pending').then((r) => r.data),
    refetchInterval: 20000,
  });
}

function useDoctors() {
  return useQuery({
    queryKey: ['tv-doctors'],
    queryFn: () => api.get('/staff/doctors').then((r) => r.data),
    refetchInterval: 60000,
  });
}

// ────────────────────────────────────────────────────────────────────────────

const STATUS_LABELS = {
  waiting: 'Waiting',
  in_consultation: 'In Consultation',
  consultation_completed: 'Consultation Done',
  completed: 'Completed',
  sent_to_pharmacy: 'At Pharmacy',
  pharmacy_completed: 'Pharmacy Done',
  sent_to_lab: 'At Lab',
  admitted: 'Admitted',
  discharged: 'Discharged',
  cancelled: 'Cancelled',
  no_show: 'No Show',
};

const LANG_BADGES = [
  { code: 'en-IN', label: 'EN' },
  { code: 'ta-IN', label: 'TA' },
  { code: 'hi-IN', label: 'HI' },
];

const BADGE_KEYS = new Set([
  'waiting', 'in_consultation', 'consultation_completed', 'completed',
  'sent_to_pharmacy', 'pharmacy_completed', 'sent_to_lab', 'admitted',
  'pending', 'sample_collected', 'processing', 'cancelled',
]);

function StatusBadge({ status }) {
  const label = STATUS_LABELS[status] || status?.replace(/_/g, ' ') || '—';
  const tone = BADGE_KEYS.has(status) ? status : 'default';
  return <span className={`tvq-badge tvq-badge--${tone}`}>{label}</span>;
}

// ── Name pronunciation for waiting-room TTS ─────────────────────────────────
// Browser voices often mash Indian names. We clean titles/initials, insert
// pauses between parts, and respell common patterns so speech is clearer.

const TITLE_RE = /^(dr|doctor|mr|mister|mrs|miss|ms|prof|professor)\.?\s+/i;

const NAME_PHONETICS = {
  deepak: 'Dee-pak',
  suresh: 'Soo-resh',
  ramesh: 'Raa-mesh',
  rajesh: 'Raa-jesh',
  mahesh: 'Maa-hesh',
  dinesh: 'Dee-nesh',
  ganesh: 'Ga-nesh',
  kamesh: 'Kaa-mesh',
  naresh: 'Naa-resh',
  hitesh: 'Hee-tesh',
  mukesh: 'Moo-kesh',
  rakesh: 'Raa-kesh',
  lokesh: 'Lo-kesh',
  yogesh: 'Yo-gesh',
  kumar: 'Koo-mar',
  kumari: 'Koo-maa-ri',
  priya: 'Pree-ya',
  priyanka: 'Pree-yaan-ka',
  pooja: 'Poo-ja',
  puja: 'Poo-ja',
  anitha: 'A-nee-tha',
  anita: 'A-nee-tha',
  sunitha: 'Su-nee-tha',
  sunita: 'Su-nee-tha',
  kavitha: 'Ka-vee-tha',
  kavita: 'Ka-vee-tha',
  geetha: 'Gee-tha',
  gita: 'Gee-tha',
  meena: 'Mee-na',
  mina: 'Mee-na',
  reena: 'Ree-na',
  rina: 'Ree-na',
  seetha: 'See-tha',
  sita: 'See-tha',
  lakshmi: 'Laksh-mee',
  laxmi: 'Laksh-mee',
  saraswathi: 'Sa-ras-wa-thi',
  saraswati: 'Sa-ras-wa-thi',
  krishnan: 'Krish-nan',
  krishna: 'Krish-na',
  krish: 'Krish',
  venkatesh: 'Ven-ka-tesh',
  venkatesan: 'Ven-ka-te-san',
  venkat: 'Ven-kat',
  srinivasan: 'Sri-ni-vaa-san',
  srinivas: 'Sri-ni-vas',
  subramanian: 'Su-bra-ma-ni-an',
  subramaniam: 'Su-bra-ma-ni-am',
  balaji: 'Baa-laa-ji',
  murugan: 'Mu-ru-gan',
  murthy: 'Mur-thi',
  murthi: 'Mur-thi',
  sharma: 'Shar-ma',
  verma: 'Ver-ma',
  gupta: 'Gup-ta',
  singh: 'Sing',
  redy: 'Red-dy',
  reddy: 'Red-dy',
  naidu: 'Nai-du',
  pillai: 'Pil-lai',
  iyer: 'Ai-yer',
  iyengar: 'Ai-yen-gar',
  nair: 'Nair',
  menon: 'Me-non',
  joseph: 'Jo-sef',
  john: 'Jon',
  george: 'Jorj',
  thomas: 'To-mas',
  mary: 'Mair-ee',
  fatima: 'Faa-thi-ma',
  aisha: 'Ai-sha',
  ahmed: 'Ah-med',
  ahmad: 'Ah-mad',
  mohammed: 'Mo-ham-med',
  mohammad: 'Mo-ham-mad',
  muhammad: 'Mu-ham-mad',
  abdul: 'Ab-dul',
  rahman: 'Rah-maan',
  rahmanan: 'Rah-maa-nan',
  sanjeevi: 'San-jee-vee',
  sanjeev: 'San-jeev',
  sanjeevani: 'San-jee-va-ni',
  vijay: 'Vi-jay',
  vijaya: 'Vi-ja-ya',
  ajay: 'A-jay',
  ajith: 'A-jith',
  ajit: 'A-jit',
  arun: 'A-run',
  aruna: 'A-ru-na',
  anand: 'Aa-nand',
  ananth: 'Aa-nanth',
  anantha: 'Aa-nan-tha',
  karthik: 'Kar-thik',
  karthikeyan: 'Kar-thi-ke-yan',
  kartik: 'Kar-tik',
  siva: 'Si-va',
  shiva: 'Shi-va',
  shivani: 'Shi-vaa-ni',
  nithya: 'Nith-ya',
  nitya: 'Nit-ya',
  divya: 'Div-ya',
  vidya: 'Vid-ya',
  vidhya: 'Vidh-ya',
  swetha: 'Swee-tha',
  shweta: 'Shwe-tha',
  swathi: 'Swaa-thi',
  swati: 'Swaa-ti',
  padma: 'Pad-ma',
  kamala: 'Ka-ma-la',
  radha: 'Raa-dha',
  radhika: 'Raa-dhi-ka',
  manoj: 'Ma-noj',
  manoharan: 'Ma-no-ha-ran',
  prakash: 'Pra-kaash',
  prabhakaran: 'Pra-bhaa-ka-ran',
  bharath: 'Bha-rath',
  bharat: 'Bha-rat',
  chandran: 'Chan-dran',
  chandra: 'Chan-dra',
  chandrasekar: 'Chan-dra-se-kar',
  chandrasekaran: 'Chan-dra-se-ka-ran',
  sekaran: 'Se-ka-ran',
  sekhar: 'Se-khar',
  shekar: 'She-kar',
  gopal: 'Go-paal',
  gopalan: 'Go-paa-lan',
  ravi: 'Raa-vi',
  ravichandran: 'Raa-vi-chan-dran',
  selvam: 'Sel-vam',
  selvi: 'Sel-vi',
  kannan: 'Kan-nan',
  pandian: 'Paan-di-an',
  pandiyan: 'Paan-di-yan',
  rajendran: 'Raa-jen-dran',
  rajendra: 'Raa-jen-dra',
  thirumalai: 'Thi-ru-maa-lai',
  thirumal: 'Thi-ru-maal',
  meenakshi: 'Mee-naak-shi',
  minakshi: 'Mee-naak-shi',
  janani: 'Ja-na-ni',
  jaya: 'Ja-ya',
  jayanthi: 'Ja-yan-thi',
  jayanti: 'Ja-yan-ti',
  kala: 'Kaa-la',
  kalai: 'Ka-lai',
  kalpana: 'Kal-pa-na',
  nirmala: 'Nir-ma-la',
  vimala: 'Vi-ma-la',
  usha: 'U-sha',
  uma: 'U-ma',
  indira: 'In-di-ra',
  indra: 'In-dra',
  ram: 'Raam',
  rama: 'Raa-ma',
  ramya: 'Raam-ya',
  raman: 'Raa-man',
  ramalingam: 'Raa-ma-lin-gam',
  lakshmanan: 'Laksh-ma-nan',
  laxman: 'Laksh-man',
  hari: 'Ha-ri',
  harish: 'Ha-rish',
  harini: 'Ha-ri-ni',
  gowri: 'Gow-ri',
  gauri: 'Gau-ri',
  parvathi: 'Par-va-thi',
  parvati: 'Par-va-ti',
  shanthi: 'Shaan-thi',
  shanti: 'Shaan-ti',
  santhi: 'Shaan-thi',
  vasanth: 'Va-santh',
  vasanthi: 'Va-san-thi',
  vinoth: 'Vi-noth',
  vinod: 'Vi-nod',
  vimal: 'Vi-mal',
  vivek: 'Vi-vek',
  vikram: 'Vik-ram',
  sakthi: 'Sak-thi',
  shakti: 'Shak-ti',
  tamil: 'Ta-mil',
  selvan: 'Sel-van',
  murugesh: 'Mu-ru-gesh',
  palani: 'Pa-la-ni',
  palanisamy: 'Pa-la-ni-saa-my',
  samy: 'Saa-my',
  swamy: 'Swaa-my',
  nagaraj: 'Naa-ga-raaj',
  nagarajan: 'Naa-ga-raa-jan',
  sathya: 'Sath-ya',
  satya: 'Sat-ya',
  sathyam: 'Sath-yam',
  bala: 'Baa-la',
  balasubramanian: 'Baa-la-su-bra-ma-ni-an',
  mohan: 'Mo-han',
  mohana: 'Mo-ha-na',
  madhavi: 'Maad-ha-vi',
  madhu: 'Ma-dhu',
  madhumitha: 'Ma-dhu-mi-tha',
  nandhini: 'Nan-dhi-ni',
  nandini: 'Nan-di-ni',
  keerthana: 'Keer-tha-na',
  kirthana: 'Kir-tha-na',
  keerti: 'Keer-thi',
  kiran: 'Ki-ran',
  varun: 'Va-run',
  varalakshmi: 'Va-ra-laksh-mee',
  sudha: 'Su-dha',
  sudhakar: 'Su-dhaa-kar',
  babu: 'Baa-bu',
  ammu: 'Am-mu',
  amir: 'A-meer',
  ameer: 'A-meer',
  farzana: 'Far-zaa-na',
  yasmin: 'Yas-min',
  jasmine: 'Jas-min',
};

function stripNameTitles(name) {
  let s = String(name || '').trim();
  while (TITLE_RE.test(s)) s = s.replace(TITLE_RE, '');
  return s.trim();
}

function splitCamelCase(word) {
  return word
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

function expandInitialToken(token) {
  const t = token.replace(/\./g, '').trim();
  if (!t) return '';
  // Single letter or short ALL-CAPS initial cluster: A / AK / A.K
  if (/^[A-Za-z]{1,3}$/.test(t) && t === t.toUpperCase()) {
    return t.split('').join('. ') + '.';
  }
  if (/^[A-Za-z]\.?$/.test(token)) {
    return `${t.toUpperCase()}.`;
  }
  return null;
}

function phoneticWord(word) {
  const clean = word.replace(/[^A-Za-z]/g, '');
  if (!clean) return word;
  const key = clean.toLowerCase();
  if (NAME_PHONETICS[key]) return NAME_PHONETICS[key];

  // Heuristic syllable breaks for long Indian-style names not in the map
  let w = clean;
  w = w.replace(/([aeiou])([^aeiouyr]{1})([aeiou])/gi, '$1$2-$3');
  // Common ending chunks
  w = w.replace(/(krishnan)$/i, 'krish-nan');
  w = w.replace(/(nathan)$/i, 'na-than');
  w = w.replace(/(swamy|samy)$/i, 'saa-my');
  w = w.replace(/(esh|ish)$/i, (m) => m.toLowerCase() === 'esh' ? 'esh' : 'ish');
  // Prefer hyphens already inserted; fall back to spaced soft vowels
  if (!w.includes('-') && w.length >= 7) {
    w = w.replace(/([bcdfghjklmnpqrstvwxyz]{2,})([aeiou])/gi, '$1-$2');
  }
  // Spaces (not hyphens) — many TTS engines literally say "hyphen"
  return w
    .split('-')
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
}

/** Display-safe cleaned name (titles stripped, spaced properly). */
function displayPersonName(name) {
  if (!name) return '';
  return stripNameTitles(name)
    .replace(/[_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * TTS-friendly spoken form of a person name (core only, no titles).
 * Example: "Dr. A.K. Suresh Kumar" → "A. K., Soo resh, Koo mar"
 */
function speakPersonName(name) {
  const cleaned = displayPersonName(name);
  if (!cleaned) return '';

  const rawParts = cleaned
    .split(/[\s_/]+/)
    .flatMap((part) => {
      if (/^[A-Za-z](\.[A-Za-z])+\.?$/i.test(part)) {
        return part.replace(/\./g, ' ').trim().split(/\s+/);
      }
      if (/^[A-Za-z](\.[A-Za-z])+[A-Za-z]{2,}/i.test(part)) {
        const m = part.match(/^([A-Za-z](?:\.[A-Za-z])+)\.?(.*)$/i);
        if (m) return [...m[1].replace(/\./g, ' ').trim().split(/\s+/), m[2]].filter(Boolean);
      }
      return [splitCamelCase(part)];
    })
    .join(' ')
    .split(/\s+/)
    .filter(Boolean);

  const spoken = rawParts.map((part) => {
    const initial = expandInitialToken(part);
    if (initial) return initial;
    return phoneticWord(part);
  });

  // Commas = natural PA pauses between name parts
  return spoken.join(', ');
}

function patientHonorificEn(patient) {
  const g = (patient?.gender || '').toLowerCase();
  if (g === 'male') return 'Mister';
  if (g === 'female') return 'Miss';
  return '';
}

/** Build EN→TA→HI speech parts; names always spoken with clear English voice. */
function buildTrilingualCall({
  patient, doctor,
  enBeforeName, enBetweenNameAndDoc, enAfterDoc,
  taBeforeName, taBetweenNameAndDoc, taAfterDoc,
  hiBeforeName, hiBetweenNameAndDoc, hiAfterDoc,
  enOnlyAfterName, taOnlyAfterName, hiOnlyAfterName,
}) {
  const nameCore = speakPersonName(patient?.name);
  const docCore = doctor ? speakPersonName(doctor?.name) : '';
  const hon = patientHonorificEn(patient);
  const sayName = nameCore
    ? (hon ? `${hon}, ${nameCore}` : nameCore)
    : '';
  const sayDoc = docCore || '';

  const enName = sayName || 'the patient';
  const taName = nameCore || 'நோயாளி';
  const hiName = nameCore || 'मरीज़';
  const enDoc = sayDoc ? `Doctor, ${sayDoc}` : 'the consulting doctor';
  const taDoc = sayDoc || '';
  const hiDoc = sayDoc || '';

  const withDoc = Boolean(doctor && (enBetweenNameAndDoc || taBetweenNameAndDoc));

  return [
    {
      lang: 'en-IN',
      parts: withDoc ? [
        { lang: 'en-IN', text: enBeforeName },
        { lang: 'en-IN', text: enName, isName: true },
        { lang: 'en-IN', text: enBetweenNameAndDoc },
        { lang: 'en-IN', text: enDoc, isName: true },
        { lang: 'en-IN', text: enAfterDoc },
      ] : [
        { lang: 'en-IN', text: enBeforeName },
        { lang: 'en-IN', text: enName, isName: true },
        { lang: 'en-IN', text: enOnlyAfterName || enAfterDoc },
      ],
    },
    {
      lang: 'ta-IN',
      parts: withDoc ? [
        { lang: 'ta-IN', text: taBeforeName },
        { lang: 'en-IN', text: taName, isName: true },
        { lang: 'ta-IN', text: taBetweenNameAndDoc },
        { lang: 'en-IN', text: taDoc, isName: true },
        { lang: 'ta-IN', text: taAfterDoc },
      ] : [
        { lang: 'ta-IN', text: taBeforeName },
        { lang: 'en-IN', text: taName, isName: true },
        { lang: 'ta-IN', text: taOnlyAfterName || taAfterDoc },
      ],
    },
    {
      lang: 'hi-IN',
      parts: withDoc ? [
        { lang: 'hi-IN', text: hiBeforeName },
        { lang: 'en-IN', text: hiName, isName: true },
        { lang: 'hi-IN', text: hiBetweenNameAndDoc },
        { lang: 'en-IN', text: hiDoc, isName: true },
        { lang: 'hi-IN', text: hiAfterDoc },
      ] : [
        { lang: 'hi-IN', text: hiBeforeName },
        { lang: 'en-IN', text: hiName, isName: true },
        { lang: 'hi-IN', text: hiOnlyAfterName || hiAfterDoc },
      ],
    },
  ].map((speech) => ({
    ...speech,
    // Keep a flat preview string for the on-screen script panel
    text: speech.parts.map((p) => p.text).join(''),
    parts: speech.parts.filter((p) => p.text && String(p.text).trim()),
  }));
}

export default function TVQueueDisplayPage() {
  const { user } = useSelector((s) => s.auth);
  const { branding } = useBranding();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(new Date());
  const [socketConnected, setSocketConnected] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speakingLang, setSpeakingLang] = useState(null);
  const [speakingText, setSpeakingText] = useState('');
  const [activeVoiceName, setActiveVoiceName] = useState('');
  const callIndexRef = useRef(0);
  const speakIntervalRef = useRef(null);
  const voicesRef = useRef([]);

  const opQuery = useOpQueue();
  const labQuery = useLabQueue();
  const pharmacyQuery = usePharmacyQueue();
  const doctorsQuery = useDoctors();

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Ensure a socket connection exists (this route can be opened directly,
  // without ever going through MainLayout, so it must init its own socket).
  useEffect(() => {
    const socket = initSocket(user?._id);
    setSocketConnected(!!socket?.connected);

    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);
    const onOpUpdate = () => queryClient.invalidateQueries({ queryKey: ['tv-op-queue'] });
    const onLabUpdate = () => queryClient.invalidateQueries({ queryKey: ['tv-lab-queue'] });

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('queue:update', onOpUpdate);
    socket.on('lab:update', onLabUpdate);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('queue:update', onOpUpdate);
      socket.off('lab:update', onLabUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);

  const opList = opQuery.data?.data || [];
  const opStats = opQuery.data?.stats || { waiting: 0, in_consultation: 0, completed: 0, total: 0 };
  const labList = labQuery.data?.data || [];
  const pharmacyList = pharmacyQuery.data?.data || [];
  const doctors = doctorsQuery.data?.data || [];

  // OP has two distinct roles on a real queue board, and they must never be
  // collapsed into one:
  //  - "IN CONSULTATION": whoever is currently with the doctor right now.
  //    This is informational only — we do NOT keep calling this token once
  //    the patient is already inside.
  //  - "NOW CALLING": the next waiting token being summoned to the room.
  //    This is the one the voice announcer speaks. As soon as that patient's
  //    status flips to in_consultation, they move into the box above and the
  //    next waiting token automatically becomes the new "now calling".
  const opInConsultation = useMemo(() => {
    return opList
      .filter((o) => o.status === 'in_consultation')
      .sort((a, b) => new Date(b.consultationStart || b.updatedAt) - new Date(a.consultationStart || a.updatedAt))[0] || null;
  }, [opList]);

  const opWaitingSorted = useMemo(
    () => opList.filter((o) => o.status === 'waiting').sort((a, b) => (a.tokenNumber || '').localeCompare(b.tokenNumber || '')),
    [opList]
  );

  const opNextCalling = opWaitingSorted[0] || null;

  const opUpcoming = useMemo(
    () => opWaitingSorted.filter((o) => o._id !== opNextCalling?._id).slice(0, 5),
    [opWaitingSorted, opNextCalling]
  );

  // Recently completed tokens (today) — shown on the board so the queue
  // reflects the full status lifecycle: waiting → in consultation → completed.
  const opRecentCompleted = useMemo(() => {
    return opList
      .filter((o) => ['completed', 'consultation_completed'].includes(o.status))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 3);
  }, [opList]);

  const opSorted = useMemo(() => {
    const order = { in_consultation: 0, waiting: 1 };
    const active = [...opList]
      .filter((o) => ['waiting', 'in_consultation'].includes(o.status))
      .sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || (a.tokenNumber || '').localeCompare(b.tokenNumber || ''));
    return [...active, ...opRecentCompleted].slice(0, 8);
  }, [opList, opRecentCompleted]);

  // Lab: active items = anything not completed/cancelled
  const labActive = useMemo(
    () => labList.filter((l) => !['completed', 'cancelled'].includes(l.status))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    [labList]
  );
  const labNowServing = labActive[0] || null;

  // Pharmacy queue already sorted by the API (oldest first)
  const pharmacyNowServing = pharmacyList[0] || null;

  // "Online / Scheduled" — appointments booked in advance, still waiting
  const scheduledList = useMemo(
    () => opList
      .filter((o) => ['appointment', 'followup'].includes(o.appointmentType) && o.status === 'waiting')
      .sort((a, b) => new Date(a.scheduledTime || a.tokenDate) - new Date(b.scheduledTime || b.tokenDate)),
    [opList]
  );

  // Doctor availability, derived live from today's queue (no separate status
  // field exists on the Doctor record, so we compute it from real OP data).
  const doctorRows = useMemo(() => {
    return doctors.map((doc) => {
      const mine = opList.filter((o) => o.doctor?._id === doc._id || o.doctor === doc._id);
      const active = mine.find((o) => o.status === 'in_consultation');
      const waitingCount = mine.filter((o) => o.status === 'waiting').length;
      return {
        ...doc,
        status: active ? 'In Consultation' : waitingCount > 0 ? 'Available' : 'Free',
        currentToken: active?.tokenNumber || '—',
        waitingCount,
      };
    });
  }, [doctors, opList]);

  // Screen text keeps normal spelling; voice uses phonetic spoken forms.
  const displayPatient = (patient) => {
    const n = displayPersonName(patient?.name);
    if (!n) return 'Patient';
    const g = (patient?.gender || '').toLowerCase();
    const title = g === 'male' ? 'Mr.' : g === 'female' ? 'Ms.' : '';
    return title ? `${title} ${n}` : n;
  };
  const displayDoctor = (doctor) => (doctor?.name ? `Dr. ${displayPersonName(doctor.name)}` : 'Doctor');

  // Speak token codes clearly for a waiting-room PA (A12 → "A, 1, 2").
  const speakTokenEn = (token) => {
    if (!token) return 'unknown';
    return String(token)
      .toUpperCase()
      .split('')
      .map((ch) => (/[A-Z]/.test(ch) ? ch : /[0-9]/.test(ch) ? ch : ' '))
      .join(', ')
      .replace(/,\s*,/g, ',')
      .replace(/^,\s*|,\s*$/g, '')
      .trim();
  };
  const DIGIT_TA = { 0: 'பூஜ்யம்', 1: 'ஒன்று', 2: 'இரண்டு', 3: 'மூன்று', 4: 'நான்கு', 5: 'ஐந்து', 6: 'ஆறு', 7: 'ஏழு', 8: 'எட்டு', 9: 'ஒன்பது' };
  const DIGIT_HI = { 0: 'शून्य', 1: 'एक', 2: 'दो', 3: 'तीन', 4: 'चार', 5: 'पाँच', 6: 'छह', 7: 'सात', 8: 'आठ', 9: 'नौ' };
  const speakTokenTa = (token) => String(token || '')
    .toUpperCase()
    .split('')
    .map((ch) => (DIGIT_TA[ch] || ch))
    .join(' ');
  const speakTokenHi = (token) => String(token || '')
    .toUpperCase()
    .split('')
    .map((ch) => (DIGIT_HI[ch] || ch))
    .join(' ');

  // Active calls drive screen text + voice. OP calls the NEXT waiting token
  // (not the patient already inside). Each call is spoken EN → TA → HI.
  const activeCalls = useMemo(() => {
    const calls = [];

    if (opNextCalling) {
      const token = opNextCalling.tokenNumber;
      const showName = displayPatient(opNextCalling.patient);
      const showDoc = displayDoctor(opNextCalling.doctor);
      const dept = opNextCalling.department?.name || 'OPD';
      calls.push({
        key: `op-${opNextCalling._id}`,
        tone: 'op',
        title: 'OP Consultation',
        text: `Token ${token} — ${showName}. Please go to ${dept} for consultation with ${showDoc}.`,
        speeches: buildTrilingualCall({
          patient: opNextCalling.patient,
          doctor: opNextCalling.doctor,
          enBeforeName: `Attention please. This is an out-patient consultation call. Token number ${speakTokenEn(token)}. Patient name is, `,
          enBetweenNameAndDoc: `. Please proceed now to the ${dept} consultation room, for your appointment with `,
          enAfterDoc: `. Kindly carry your O P slip and wait outside the room until called in. Thank you.`,
          taBeforeName: `கவனம் செலுத்துங்கள். இது வெளிநோயாளி ஆலோசனை அழைப்பு. டோக்கன் எண் ${speakTokenTa(token)}. நோயாளியின் பெயர், `,
          taBetweenNameAndDoc: ` அவர்கள். தயவுசெய்து இப்போது ${dept} ஆலோசனை அறைக்குச் செல்லுங்கள். டாக்டர் `,
          taAfterDoc: ` அவர்களுடன் ஆலோசனைக்காக. உங்கள் ஓ பி சீட்டை எடுத்துச் சென்று, அறைக்கு வெளியே காத்திருங்கள். நன்றி.`,
          hiBeforeName: `कृपया ध्यान दें। यह आउट पेशेंट परामर्श की घोषणा है। टोकन नंबर ${speakTokenHi(token)}। मरीज़ का नाम है, `,
          hiBetweenNameAndDoc: `। कृपया अभी ${dept} परामर्श कक्ष में जाएँ, डॉक्टर `,
          hiAfterDoc: ` से मिलने के लिए। अपना ओ पी पर्ची साथ रखें और कमरे के बाहर प्रतीक्षा करें। धन्यवाद।`,
        }),
      });
    }

    if (labNowServing) {
      const labToken = labNowServing.labNumber || labNowServing._id.slice(-5).toUpperCase();
      const showName = displayPatient(labNowServing.patient);
      const tests = labNowServing.tests?.map((t) => t.testName).filter(Boolean).slice(0, 3).join(', ')
        || labNowServing.labType
        || 'lab test';
      calls.push({
        key: `lab-${labNowServing._id}`,
        tone: 'lab',
        title: 'Laboratory',
        text: `Lab token ${labToken} — ${showName}. Please go to the sample collection counter.`,
        speeches: buildTrilingualCall({
          patient: labNowServing.patient,
          enBeforeName: `Attention please. This is a laboratory call. Lab token number ${speakTokenEn(labToken)}. Patient name is, `,
          enOnlyAfterName: `. Please proceed now to the sample collection counter in the laboratory. Carry your lab request form or prescription. Tests: ${tests}. Thank you.`,
          taBeforeName: `கவனம் செலுத்துங்கள். இது ஆய்வக அழைப்பு. லேப் டோக்கன் எண் ${speakTokenTa(labToken)}. நோயாளியின் பெயர், `,
          taOnlyAfterName: ` அவர்கள். தயவுசெய்து இப்போது ஆய்வக மாதிரி சேகரிப்பு கவுண்டருக்குச் செல்லுங்கள். உங்கள் லேப் படிவம் அல்லது மருந்துச்சீட்டை எடுத்துச் செல்லுங்கள். நன்றி.`,
          hiBeforeName: `कृपया ध्यान दें। यह प्रयोगशाला की घोषणा है। लैब टोकन नंबर ${speakTokenHi(labToken)}। मरीज़ का नाम है, `,
          hiOnlyAfterName: `। कृपया अभी लैब सैंपल कलेक्शन काउंटर पर जाएँ। अपनी लैब पर्ची या नुस्खा साथ रखें। धन्यवाद।`,
        }),
      });
    }

    if (pharmacyNowServing) {
      const token = pharmacyNowServing.tokenNumber;
      const showName = displayPatient(pharmacyNowServing.patient);
      calls.push({
        key: `pharma-${pharmacyNowServing._id}`,
        tone: 'pharma',
        title: 'Pharmacy',
        text: `Token ${token} — ${showName}. Medicines ready at the pharmacy counter.`,
        speeches: buildTrilingualCall({
          patient: pharmacyNowServing.patient,
          enBeforeName: `Attention please. This is a pharmacy call. Token number ${speakTokenEn(token)}. Patient name is, `,
          enOnlyAfterName: `. Your medicines are ready. Please proceed now to the pharmacy counter and collect your medicines. Bring your token slip or prescription for verification. Thank you.`,
          taBeforeName: `கவனம் செலுத்துங்கள். இது மருந்தக அழைப்பு. டோக்கன் எண் ${speakTokenTa(token)}. நோயாளியின் பெயர், `,
          taOnlyAfterName: ` அவர்கள். உங்கள் மருந்துகள் தயார். தயவுசெய்து இப்போது மருந்தகக் கவுண்டருக்குச் சென்று மருந்துகளைப் பெற்றுக்கொள்ளுங்கள். சரிபார்ப்புக்கு உங்கள் டோக்கன் சீட்டு அல்லது மருந்துச்சீட்டை எடுத்து வாருங்கள். நன்றி.`,
          hiBeforeName: `कृपया ध्यान दें। यह फार्मेसी की घोषणा है। टोकन नंबर ${speakTokenHi(token)}। मरीज़ का नाम है, `,
          hiOnlyAfterName: `। आपकी दवाइयाँ तैयार हैं। कृपया अभी फार्मेसी काउंटर पर जाएँ और दवाइयाँ ले लें। जाँच के लिए अपना टोकन या नुस्खा साथ लाएँ। धन्यवाद।`,
        }),
      });
    }

    if (scheduledList[0]) {
      const appt = scheduledList[0];
      const token = appt.tokenNumber;
      const showName = displayPatient(appt.patient);
      const showDoc = displayDoctor(appt.doctor);
      const dept = appt.department?.name || 'OPD';
      const timeStr = new Date(appt.scheduledTime || appt.tokenDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      calls.push({
        key: `sched-${appt._id}`,
        tone: 'sched',
        title: 'Appointment',
        text: `Appointment — ${showName} at ${timeStr} with ${showDoc}, ${dept}. Please report to reception.`,
        speeches: buildTrilingualCall({
          patient: appt.patient,
          doctor: appt.doctor,
          enBeforeName: `Attention please. This is an appointment reminder. Token number ${speakTokenEn(token)}. Patient name is, `,
          enBetweenNameAndDoc: `. Your appointment is scheduled at ${timeStr}, with `,
          enAfterDoc: `, in ${dept}. Please proceed now to the reception counter to check in. Thank you.`,
          taBeforeName: `கவனம் செலுத்துங்கள். இது நேரம் ஒதுக்கீட்டு நினைவூட்டல். டோக்கன் எண் ${speakTokenTa(token)}. நோயாளியின் பெயர், `,
          taBetweenNameAndDoc: ` அவர்கள். உங்கள் நேரம் ${timeStr} மணிக்கு, டாக்டர் `,
          taAfterDoc: ` உடன், ${dept} பிரிவில் ஒதுக்கப்பட்டுள்ளது. தயவுசெய்து இப்போது வரவேற்பு கவுண்டருக்குச் சென்று பதிவு செய்யுங்கள். நன்றி.`,
          hiBeforeName: `कृपया ध्यान दें। यह अपॉइंटमेंट की याद दिलाने वाली घोषणा है। टोकन नंबर ${speakTokenHi(token)}। मरीज़ का नाम है, `,
          hiBetweenNameAndDoc: `। आपका अपॉइंटमेंट ${timeStr} बजे, डॉक्टर `,
          hiAfterDoc: ` के साथ, ${dept} में निर्धारित है। कृपया अभी रिसेप्शन काउंटर पर जाएँ और चेक इन करें। धन्यवाद।`,
        }),
      });
    }

    return calls;
  }, [opNextCalling?._id, labNowServing?._id, pharmacyNowServing?._id, scheduledList]);

  const announcements = useMemo(
    () => activeCalls.map((c) => ({ time: now, text: c.text, tone: c.tone, title: c.title })),
    [activeCalls, now]
  );

  const tickerItems = useMemo(() => {
    if (announcements.length === 0) {
      return [
        'Welcome — please wait for your token to be called',
        'Voice announcements: English, then Tamil, then Hindi',
        branding.footerNote || 'Better Experience, Better Care',
      ];
    }
    return announcements.map((a) => a.text);
  }, [announcements, branding.footerNote]);

  // Prefer a clear female Indian / neural PA voice when the OS provides one.
  useEffect(() => {
    if (!('speechSynthesis' in window)) return undefined;
    const loadVoices = () => { voicesRef.current = window.speechSynthesis.getVoices() || []; };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const pickVoice = (lang) => {
    const voices = voicesRef.current;
    if (!voices?.length) return null;
    const base = lang.split('-')[0];
    const wantIndianEnglish = base === 'en';

    // Indian English only — never fall back to American / UK / Australian English
    // when an en-IN voice is available on this PC/TV.
    const indianEn = voices.filter((v) => {
      const name = `${v.name} ${v.lang}`.toLowerCase();
      const isEn = (v.lang || '').toLowerCase().startsWith('en');
      if (!isEn) return false;
      if ((v.lang || '').toLowerCase().startsWith('en-in')) return true;
      if (/india|indian|neerja|heera|ravi \(?natural\)?|en-in/.test(name) && /english|en-/.test(name)) return true;
      // Explicit Indian English Microsoft / Google voices by name
      if (/\bneerja\b|\bheera\b|\bravi\b/.test(name) && !/us english|american|en-us|en_us/.test(name)) return true;
      return false;
    });

    const notWesternEn = (v) => {
      const name = `${v.name} ${v.lang}`.toLowerCase();
      if (/en-us|en_us|en-gb|en-au|en-ca|american|united states|us english|uk english|british|australian/.test(name)) return false;
      if (/zira|david|mark|susan|linda|richard|george|hazel|susan|sam\b/.test(name) && /en-us|american|us /.test(name)) return false;
      return true;
    };

    let pool;
    if (wantIndianEnglish) {
      pool = indianEn.length
        ? indianEn
        : voices.filter((v) => (v.lang || '').toLowerCase().startsWith('en-in'));
      // Last resort: any English that is NOT American/UK (still avoid US accent)
      if (!pool.length) {
        pool = voices.filter((v) => (v.lang || '').toLowerCase().startsWith('en') && notWesternEn(v));
      }
    } else {
      // Tamil / Hindi — prefer India locale voices only
      pool = voices.filter((v) => {
        const l = (v.lang || '').toLowerCase();
        return l === lang.toLowerCase() || l.startsWith(`${base}-in`) || l === base;
      });
      if (!pool.length) {
        pool = voices.filter((v) => (v.lang || '').toLowerCase().startsWith(base));
      }
    }

    if (!pool.length) return null;

    const score = (v) => {
      const name = `${v.name} ${v.lang}`.toLowerCase();
      const l = (v.lang || '').toLowerCase();
      let s = 0;

      if (l === lang.toLowerCase()) s += 60;
      if (l.startsWith(`${base}-in`)) s += 80;
      if (/india|indian|en-in/.test(name)) s += 50;

      // Strongly reject American / Western English accents
      if (/en-us|en_us|american|united states|us english/.test(name)) s -= 200;
      if (/en-gb|british|uk english|en-au|australian|en-ca/.test(name)) s -= 120;

      // Prefer natural Indian voices
      if (/neural|natural|online|premium|enhanced|wavenet|studio/.test(name)) s += 35;
      if (/microsoft|google/.test(name)) s += 15;

      // Known Indian English voices (Windows / Chrome)
      if (/\bneerja\b/.test(name)) s += 70; // Microsoft Indian English female
      if (/\bheera\b/.test(name)) s += 65;
      if (/\bravi\b/.test(name) && /en/.test(name)) s += 55; // Microsoft Indian English male
      if (/vaani|ananya|swara|kavya|priya|raveena|lekha|meera|sonia/.test(name)) s += 40;

      // Hospital PA: prefer clear female Indian voice when available
      if (/female|woman|neerja|heera|vaani|ananya|swara/.test(name)) s += 20;
      if (/zira|david|mark|susan/.test(name)) s -= 80; // classic US Windows voices

      return s;
    };

    return [...pool].sort((a, b) => score(b) - score(a))[0] || null;
  };

  useEffect(() => {
    if (!soundEnabled || muted || !('speechSynthesis' in window)) return undefined;
    let cancelled = false;

    const speakUtterance = (part, uiLang, onDone) => {
      if (cancelled) return;
      const utter = new SpeechSynthesisUtterance(part.text);
      // Force Indian English locale for any English segment (never en-US)
      let lang = part.lang || uiLang;
      if ((lang || '').toLowerCase().startsWith('en')) lang = 'en-IN';
      utter.lang = lang;
      const voice = pickVoice(lang);
      if (voice) {
        utter.voice = voice;
        utter.lang = voice.lang || lang;
        setActiveVoiceName(`${voice.name} (${voice.lang})`);
      } else {
        setActiveVoiceName(lang);
      }
      // Names slower + clearer; other lines at normal PA pace
      utter.rate = part.isName ? 0.72 : (lang.startsWith('en') ? 0.88 : 0.85);
      utter.pitch = part.isName ? 1.0 : 1.05;
      utter.volume = 1;
      setSpeakingLang(uiLang);
      utter.onend = () => { if (!cancelled) onDone(); };
      utter.onerror = () => { if (!cancelled) onDone(); };
      window.speechSynthesis.speak(utter);
    };

    const speakParts = (parts, idx, uiLang, onSpeechDone) => {
      if (cancelled) return;
      if (idx >= parts.length) { onSpeechDone(); return; }
      const part = parts[idx];
      const pauseAfter = part.isName ? 450 : 120;
      speakUtterance(part, uiLang, () => {
        if (cancelled) return;
        speakIntervalRef.current = setTimeout(
          () => speakParts(parts, idx + 1, uiLang, onSpeechDone),
          pauseAfter
        );
      });
    };

    const speakLanguageBlock = (speeches, idx, onCallDone) => {
      if (cancelled) return;
      if (idx >= speeches.length) { onCallDone(); return; }
      const speech = speeches[idx];
      const parts = speech.parts?.length
        ? speech.parts
        : [{ lang: speech.lang, text: speech.text }];
      setSpeakingText(speech.text || parts.map((p) => p.text).join(''));
      speakParts(parts, 0, speech.lang, () => {
        if (cancelled) return;
        // Pause between English / Tamil / Hindi blocks
        speakIntervalRef.current = setTimeout(
          () => speakLanguageBlock(speeches, idx + 1, onCallDone),
          700
        );
      });
    };

    const speakNextCall = () => {
      if (cancelled || activeCalls.length === 0) {
        setSpeakingText('');
        setSpeakingLang(null);
        return;
      }
      const call = activeCalls[callIndexRef.current % activeCalls.length];
      callIndexRef.current += 1;
      window.speechSynthesis.cancel();
      speakLanguageBlock(call.speeches, 0, () => {
        setSpeakingLang(null);
        setSpeakingText('');
        if (!cancelled) speakIntervalRef.current = setTimeout(speakNextCall, 5000);
      });
    };

    speakNextCall();
    return () => {
      cancelled = true;
      clearTimeout(speakIntervalRef.current);
      window.speechSynthesis.cancel();
      setSpeakingText('');
      setActiveVoiceName('');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundEnabled, muted, activeCalls.map((c) => c.key).join(',')]);

  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const isLoading = opQuery.isLoading || labQuery.isLoading || pharmacyQuery.isLoading;

  return (
    <div className="tvq">
      <header className="tvq-header">
        <div className="tvq-brand">
          {branding.logo ? (
            <img src={branding.logo} alt="" className="tvq-logo" />
          ) : (
            <div className="tvq-logo tvq-logo-fallback">
              <Stethoscope className="w-7 h-7" />
            </div>
          )}
          <div className="tvq-brand-text">
            <h1 className="tvq-hospital-name">{branding.hospitalName}</h1>
            <p className="tvq-tagline">{branding.tagline || 'Patient Queue Display'}</p>
          </div>
        </div>

        <div className="tvq-clock">
          <div className="tvq-time">
            <Clock3 className="w-5 h-5 opacity-70" />
            {timeStr}
          </div>
          <div className="tvq-date">{dateStr}</div>
        </div>

        <div className="tvq-header-right">
          <div className="tvq-stats">
            <div className="tvq-stat">
              <span className="tvq-stat-value">{opStats.waiting}</span>
              <span className="tvq-stat-label">Waiting</span>
            </div>
            <div className="tvq-stat">
              <span className="tvq-stat-value">{opStats.in_consultation}</span>
              <span className="tvq-stat-label">In Consult</span>
            </div>
            <div className="tvq-stat">
              <span className="tvq-stat-value">{opStats.completed}</span>
              <span className="tvq-stat-label">Completed</span>
            </div>
            <div className="tvq-stat">
              <span className="tvq-stat-value">{opStats.total}</span>
              <span className="tvq-stat-label">Today</span>
            </div>
          </div>

          <div className={`tvq-live ${socketConnected ? 'tvq-live--on' : 'tvq-live--off'}`}>
            <span className="tvq-live-dot" />
            {socketConnected ? 'Live' : 'Offline'}
          </div>

          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className={`tvq-mute-btn ${muted || !soundEnabled ? 'tvq-mute-btn--off' : ''}`}
            title={muted ? 'Unmute announcements' : 'Mute announcements'}
          >
            <Volume2 className="w-5 h-5" />
          </button>
        </div>
      </header>

      {!soundEnabled && (
        <button type="button" onClick={() => setSoundEnabled(true)} className="tvq-sound-gate">
          <div className="tvq-sound-gate-icon">
            <Volume2 className="w-10 h-10" />
          </div>
          <h2>Tap to enable voice announcements</h2>
          <p>English → Tamil → Hindi · Required once per session</p>
        </button>
      )}

      <div className="tvq-main">
        <QueueColumn
          variant="op"
          title="OP Consultation"
          icon={Activity}
          nowCallingLabel="Now Calling"
          nowToken={opNextCalling?.tokenNumber}
          nowSubtitle={opNextCalling?.patient?.name}
          nowDetail={[opNextCalling?.doctor?.name, opNextCalling?.department?.name].filter(Boolean).join(' · ')}
          secondary={opInConsultation ? {
            label: 'In Consultation',
            token: opInConsultation.tokenNumber,
            subtitle: opInConsultation.patient?.name,
            detail: [opInConsultation.doctor?.name, opInConsultation.department?.name].filter(Boolean).join(' · '),
          } : null}
          rows={opSorted.slice(0, 8).map((o) => ({
            id: o._id,
            token: o.tokenNumber,
            name: o.patient?.name,
            meta: `${o.patient?.age ?? '—'}${o.patient?.gender ? '/' + o.patient.gender : ''} · ${o.doctor?.name || 'Unassigned'}`,
            status: o.status,
          }))}
          emptyLabel="No patients in the OP queue"
        />

        <QueueColumn
          variant="lab"
          title="Laboratory"
          icon={Beaker}
          nowCallingLabel="Now Processing"
          nowToken={labNowServing?.labNumber || (labNowServing ? labNowServing._id.slice(-5).toUpperCase() : undefined)}
          nowSubtitle={labNowServing?.patient?.name}
          nowDetail={labNowServing?.tests?.map((t) => t.testName).join(', ') || labNowServing?.labType}
          rows={labActive.slice(0, 8).map((l) => ({
            id: l._id,
            token: l.labNumber || l._id.slice(-5).toUpperCase(),
            name: l.patient?.name,
            meta: l.tests?.map((t) => t.testName).join(', ') || l.labType,
            status: l.status,
          }))}
          emptyLabel="No active lab tests"
        />

        <QueueColumn
          variant="pharma"
          title="Pharmacy"
          icon={Pill}
          nowCallingLabel="Now Serving"
          nowToken={pharmacyNowServing?.tokenNumber}
          nowSubtitle={pharmacyNowServing?.patient?.name}
          nowDetail={pharmacyNowServing?.doctor?.name ? `Prescribed by ${pharmacyNowServing.doctor.name}` : ''}
          rows={pharmacyList.slice(0, 8).map((p) => ({
            id: p._id,
            token: p.tokenNumber,
            name: p.patient?.name,
            meta: p.doctor?.name || '—',
            status: p.status,
          }))}
          emptyLabel="No prescriptions waiting"
        />

        <QueueColumn
          variant="sched"
          title="Online / Scheduled"
          icon={Globe}
          nowCallingLabel="Next Scheduled"
          nowToken={scheduledList[0]?.tokenNumber}
          nowSubtitle={scheduledList[0]?.patient?.name}
          nowDetail={scheduledList[0] ? new Date(scheduledList[0].scheduledTime || scheduledList[0].tokenDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
          rows={scheduledList.slice(0, 8).map((o) => ({
            id: o._id,
            token: o.tokenNumber,
            name: o.patient?.name,
            meta: o.doctor?.name || '—',
            status: o.status,
          }))}
          emptyLabel="No scheduled appointments waiting"
        />
      </div>

      <div className="tvq-bottom">
        <section className="tvq-panel">
          <div className="tvq-panel-head">
            <Users className="w-4 h-4 text-[var(--tvq-accent)]" />
            Doctor Availability
          </div>
          <div className="tvq-panel-body">
            {doctorRows.length === 0 && <p className="tvq-empty">No doctors on duty found.</p>}
            {doctorRows.map((doc) => {
              const statusClass = doc.status === 'In Consultation'
                ? 'tvq-doc-status--consult'
                : doc.status === 'Available'
                  ? 'tvq-doc-status--available'
                  : 'tvq-doc-status--free';
              return (
                <div key={doc._id} className="tvq-doc-row">
                  <div>
                    <p className="tvq-doc-name">{doc.name}</p>
                    <p className="tvq-doc-spec">{doc.specialization || doc.department?.name || 'General'}</p>
                  </div>
                  <div className="tvq-doc-right">
                    <span className={`tvq-doc-status ${statusClass}`}>{doc.status}</span>
                    <p className="tvq-doc-meta">Token {doc.currentToken} · {doc.waitingCount} waiting</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="tvq-panel">
          <div className="tvq-panel-head">
            <Megaphone className="w-4 h-4 text-[var(--tvq-accent)]" />
            Live Announcements
          </div>
          <div className="tvq-panel-body">
            {announcements.length === 0 && <p className="tvq-empty">No active announcements.</p>}
            {announcements.map((a, i) => (
              <div key={i} className="tvq-announce-item">
                <span className="tvq-announce-time">
                  {a.time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className={`tvq-announce-text tvq-announce-text--${a.tone || 'op'}`}>{a.text}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="tvq-panel">
          <div className="tvq-panel-head">
            <Volume2 className="w-4 h-4 text-[var(--tvq-accent)]" />
            Voice Announcer
          </div>
          <div className="tvq-voice">
            <div className={`tvq-voice-icon ${!soundEnabled || muted ? 'tvq-voice-icon--off' : activeCalls.length ? 'tvq-voice-icon--active' : ''}`}>
              <Volume2 className="w-6 h-6" />
            </div>
            <p className="tvq-voice-title">
              {!soundEnabled
                ? 'Tap screen to enable sound'
                : muted
                  ? 'Announcements muted'
                  : activeCalls.length === 0
                    ? 'Waiting for next token'
                    : 'Speaking now'}
            </p>
            {soundEnabled && !muted && (
              <div className="tvq-lang-row">
                {LANG_BADGES.map((l) => (
                  <span key={l.code} className={`tvq-lang ${speakingLang === l.code ? 'tvq-lang--on' : ''}`}>
                    {l.label}
                  </span>
                ))}
              </div>
            )}
            {activeVoiceName && soundEnabled && !muted && (
              <p className="tvq-voice-hint">Voice: {activeVoiceName}</p>
            )}
            <p className="tvq-voice-hint">Order: Indian English → Tamil → Hindi · Indian accent only</p>
            {speakingText ? (
              <p className="tvq-speaking-script">{speakingText}</p>
            ) : (
              <p className="tvq-voice-hint">
                Patient and doctor names use phonetic English pacing so they are easy to understand.
              </p>
            )}
          </div>
        </section>
      </div>

      <div className="tvq-ticker">
        <div className="tvq-ticker-label">
          <Megaphone className="w-3.5 h-3.5" />
          Notice
        </div>
        <div className="tvq-ticker-track">
          <div className="tvq-ticker-content">
            {tickerItems.map((t, i) => (
              <span key={i}>{t}</span>
            ))}
            {tickerItems.map((t, i) => (
              <span key={`dup-${i}`}>{t}</span>
            ))}
          </div>
        </div>
      </div>

      <footer className="tvq-footer">
        <div className="tvq-footer-left">
          <span className="tvq-footer-item"><Volume2 className="w-3.5 h-3.5" /> Multilingual PA</span>
          <span className="tvq-footer-item"><Wifi className="w-3.5 h-3.5" /> Real-time sync</span>
          <span className="tvq-footer-item"><Globe className="w-3.5 h-3.5" /> OP · Lab · Pharmacy · Online</span>
        </div>
        <span className="tvq-footer-note">{branding.footerNote || 'Better Experience, Better Care'}</span>
      </footer>

      {isLoading && (
        <div className="tvq-loading">
          <div className="tvq-loading-card">Loading live queue data…</div>
        </div>
      )}
      {(opQuery.isError || labQuery.isError || pharmacyQuery.isError) && !isLoading && (
        <div className="tvq-error-toast">
          <WifiOff className="w-4 h-4" /> Couldn&apos;t refresh some queues — retrying automatically.
        </div>
      )}
    </div>
  );
}

function QueueColumn({
  variant, title, icon: Icon, nowCallingLabel, nowToken, nowSubtitle, nowDetail, secondary, rows, emptyLabel,
}) {
  return (
    <div className={`tvq-col tvq-col--${variant}`}>
      <div className="tvq-col-head">
        <Icon className="w-4 h-4" />
        {title}
      </div>

      {secondary && (
        <div className="tvq-secondary">
          <div className="tvq-secondary-label">{secondary.label}</div>
          <div className="tvq-secondary-token">
            Token {secondary.token}{secondary.subtitle ? ` — ${secondary.subtitle}` : ''}
          </div>
          {secondary.detail && <div className="tvq-secondary-detail">{secondary.detail}</div>}
        </div>
      )}

      <div className="tvq-now">
        <div className="tvq-now-label">{nowCallingLabel}</div>
        <div className={`tvq-now-token ${nowToken ? '' : 'tvq-now-token--empty'}`}>{nowToken || '—'}</div>
        {nowSubtitle && <div className="tvq-now-name">{nowSubtitle}</div>}
        {nowDetail && <div className="tvq-now-detail">{nowDetail}</div>}
      </div>

      <div className="tvq-rows">
        {rows.length === 0 && <p className="tvq-empty">{emptyLabel}</p>}
        {rows.map((r) => (
          <div key={r.id} className="tvq-row">
            <span className="tvq-row-token">{r.token}</span>
            <div className="tvq-row-body">
              <div className="tvq-row-name">{r.name || '—'}</div>
              {r.meta && <div className="tvq-row-meta">{r.meta}</div>}
            </div>
            <StatusBadge status={r.status} />
          </div>
        ))}
      </div>

      <div className="tvq-col-foot">
        Showing {Math.min(8, rows.length)} · auto-refresh
      </div>
    </div>
  );
}
