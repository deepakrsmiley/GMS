import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, Beaker, Pill, CalendarClock, Users, CheckCircle2, Clock3,
  Volume2, Megaphone, Stethoscope, Globe, Wifi, WifiOff,
} from 'lucide-react';
import { useSelector } from 'react-redux';
import api from '../services/api';
import { useBranding } from '../hooks/useBranding';
import { initSocket, getSocket } from '../services/socket';

// ────────────────────────────────────────────────────────────────────────────
// Data hooks — every number on this screen comes from the live HMS database.
// ────────────────────────────────────────────────────────────────────────────

function useOpQueue() {
  return useQuery({
    queryKey: ['tv-op-queue'],
    queryFn: () => api.get('/op/queue').then((r) => r.data),
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

const STATUS_COLORS = {
  waiting: 'bg-blue-100 text-blue-800',
  in_consultation: 'bg-emerald-100 text-emerald-800',
  consultation_completed: 'bg-violet-100 text-violet-800',
  completed: 'bg-slate-200 text-slate-700',
  sent_to_pharmacy: 'bg-purple-100 text-purple-800',
  pharmacy_completed: 'bg-slate-200 text-slate-700',
  sent_to_lab: 'bg-amber-100 text-amber-800',
  admitted: 'bg-cyan-100 text-cyan-800',
  pending: 'bg-blue-100 text-blue-800',
  sample_collected: 'bg-amber-100 text-amber-800',
  processing: 'bg-purple-100 text-purple-800',
  cancelled: 'bg-slate-200 text-slate-700',
};

const LANG_BADGES = [
  { code: 'en-IN', label: 'EN' },
  { code: 'ta-IN', label: 'TA' },
  { code: 'hi-IN', label: 'HI' },
];

function StatusBadge({ status }) {
  const label = STATUS_LABELS[status] || status?.replace(/_/g, ' ') || '—';
  const color = STATUS_COLORS[status] || 'bg-slate-100 text-slate-700';
  return <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${color}`}>{label}</span>;
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
  const callIndexRef = useRef(0);
  const speakIntervalRef = useRef(null);

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

  // Turns a patient record into "Mr./Ms. Name" the way a receptionist would
  // actually say it over a PA system. Falls back gracefully if gender/name
  // is missing rather than saying "undefined". Kept English-only — Tamil
  // and Hindi versions use their own honorific words (ஜி/அவர்கள், जी)
  // instead of "Mr./Ms." since that reads naturally in those languages.
  const salutedName = (patient) => {
    if (!patient?.name) return 'the patient';
    const g = (patient.gender || '').toLowerCase();
    const title = g === 'male' ? 'Mr.' : g === 'female' ? 'Ms.' : '';
    return title ? `${title} ${patient.name}` : patient.name;
  };
  const rawName = (patient) => patient?.name || null;
  const doctorEn = (doctor) => (doctor?.name ? `Doctor ${doctor.name}` : 'the consulting doctor');
  const doctorTa = (doctor) => (doctor?.name ? `டாக்டர் ${doctor.name}` : 'மருத்துவர்');
  const doctorHi = (doctor) => (doctor?.name ? `डॉक्टर ${doctor.name}` : 'डॉक्टर');

  // A single source of truth for "who is being called right now", across
  // OP, Lab, Pharmacy and Online/Scheduled appointments. This drives both
  // the announcements ticker and the voice announcer below.
  //
  // Corporate PA-system rule for OP: once a token is INSIDE the consultation
  // room (in_consultation), it is never called out again — that would be
  // confusing to a full waiting room. Instead the system calls out the NEXT
  // waiting token by name, doctor and department, exactly like a real
  // hospital's token-call system.
  //
  // Every call is spoken in three languages, in this order: English, Tamil,
  // Hindi — the way a real corporate hospital PA system announces, one
  // language after another, back to back.
  const activeCalls = useMemo(() => {
    const calls = [];

    if (opNextCalling) {
      const nameEn = salutedName(opNextCalling.patient);
      const nameLocal = rawName(opNextCalling.patient) || 'நோயாளி';
      const nameHi = rawName(opNextCalling.patient) || 'मरीज़';
      const dept = opNextCalling.department?.name || 'the OPD';
      calls.push({
        key: `op-${opNextCalling._id}`,
        color: 'text-blue-700',
        text: `Token ${opNextCalling.tokenNumber} — ${nameEn}, kindly proceed to ${dept} for consultation with ${doctorEn(opNextCalling.doctor)}.`,
        speeches: [
          { lang: 'en-IN', text: `Attention please. Token number ${opNextCalling.tokenNumber}. ${nameEn}, kindly proceed to ${dept}, for consultation with ${doctorEn(opNextCalling.doctor)}. Thank you.` },
          { lang: 'ta-IN', text: `கவனிக்கவும். டோக்கன் எண் ${opNextCalling.tokenNumber}. ${nameLocal} அவர்கள், ${doctorTa(opNextCalling.doctor)} உடன் ஆலோசனைக்காக ${dept} பிரிவுக்கு தயவுசெய்து செல்லவும். நன்றி.` },
          { lang: 'hi-IN', text: `कृपया ध्यान दें। टोकन नंबर ${opNextCalling.tokenNumber}. ${nameHi} जी, कृपया ${doctorHi(opNextCalling.doctor)} के परामर्श के लिए ${dept} में जाएं। धन्यवाद।` },
        ],
      });
    }

    if (labNowServing) {
      const labToken = labNowServing.labNumber || labNowServing._id.slice(-5).toUpperCase();
      const nameEn = salutedName(labNowServing.patient);
      const nameLocal = rawName(labNowServing.patient) || 'நோயாளி';
      const nameHi = rawName(labNowServing.patient) || 'मरीज़';
      calls.push({
        key: `lab-${labNowServing._id}`,
        color: 'text-emerald-700',
        text: `Lab token ${labToken} — ${nameEn}, please proceed to the sample collection counter.`,
        speeches: [
          { lang: 'en-IN', text: `Attention please. Lab token ${labToken}. ${nameEn}, kindly proceed to the sample collection counter. Thank you.` },
          { lang: 'ta-IN', text: `கவனிக்கவும். லேப் டோக்கன் ${labToken}. ${nameLocal} அவர்கள், மாதிரி சேகரிப்பு கவுண்டருக்கு தயவுசெய்து செல்லவும். நன்றி.` },
          { lang: 'hi-IN', text: `कृपया ध्यान दें। लैब टोकन ${labToken}. ${nameHi} जी, कृपया सैंपल कलेक्शन काउंटर पर जाएं। धन्यवाद।` },
        ],
      });
    }

    if (pharmacyNowServing) {
      const nameEn = salutedName(pharmacyNowServing.patient);
      const nameLocal = rawName(pharmacyNowServing.patient) || 'நோயாளி';
      const nameHi = rawName(pharmacyNowServing.patient) || 'मरीज़';
      calls.push({
        key: `pharma-${pharmacyNowServing._id}`,
        color: 'text-purple-700',
        text: `Token ${pharmacyNowServing.tokenNumber} — ${nameEn}, your medicines are ready at the pharmacy counter.`,
        speeches: [
          { lang: 'en-IN', text: `Attention please. Token number ${pharmacyNowServing.tokenNumber}. ${nameEn}, kindly collect your medicines at the pharmacy counter. Thank you.` },
          { lang: 'ta-IN', text: `கவனிக்கவும். டோக்கன் எண் ${pharmacyNowServing.tokenNumber}. ${nameLocal} அவர்கள், தயவுசெய்து மருந்தகக் கவுண்டரில் உங்கள் மருந்துகளைப் பெற்றுக் கொள்ளவும். நன்றி.` },
          { lang: 'hi-IN', text: `कृपया ध्यान दें। टोकन नंबर ${pharmacyNowServing.tokenNumber}. ${nameHi} जी, कृपया फार्मेसी काउंटर से अपनी दवाइयाँ ले लें। धन्यवाद।` },
        ],
      });
    }

    if (scheduledList[0]) {
      const appt = scheduledList[0];
      const nameEn = salutedName(appt.patient);
      const nameLocal = rawName(appt.patient) || 'நோயாளி';
      const nameHi = rawName(appt.patient) || 'मरीज़';
      const dept = appt.department?.name || 'the OPD';
      const timeStr = new Date(appt.scheduledTime || appt.tokenDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      calls.push({
        key: `sched-${appt._id}`,
        color: 'text-orange-700',
        text: `Appointment reminder — ${nameEn}, scheduled at ${timeStr} with ${doctorEn(appt.doctor)}, ${dept}.`,
        speeches: [
          { lang: 'en-IN', text: `Attention please. This is a reminder for ${nameEn}, with an appointment scheduled at ${timeStr}, with ${doctorEn(appt.doctor)} in ${dept}. Kindly proceed to the reception counter. Thank you.` },
          { lang: 'ta-IN', text: `கவனிக்கவும். ${nameLocal} அவர்களுக்கு, ${timeStr} மணிக்கு ${doctorTa(appt.doctor)} உடன் ${dept} பிரிவில் நேரம் ஒதுக்கப்பட்டுள்ளது என்பதை நினைவூட்டுகிறோம். வரவேற்பு கவுண்டருக்குச் செல்லவும். நன்றி.` },
          { lang: 'hi-IN', text: `कृपया ध्यान दें। ${nameHi} जी को याद दिलाया जाता है कि उनका अपॉइंटमेंट ${timeStr} बजे ${doctorHi(appt.doctor)} के साथ ${dept} में निर्धारित है। कृपया रिसेप्शन काउंटर पर जाएं। धन्यवाद।` },
        ],
      });
    }

    return calls;
  }, [opNextCalling?._id, labNowServing?._id, pharmacyNowServing?._id, scheduledList]);


  const announcements = useMemo(
    () => activeCalls.map((c) => ({ time: now, text: c.text, color: c.color })),
    [activeCalls, now]
  );

  // Voice announcer — for every active call, speaks the English script, then
  // Tamil, then Hindi, one after another (the way a real hospital/airport PA
  // system does it), then pauses briefly and moves to the next active call
  // (OP → Lab → Pharmacy → Online, repeating). We chain each utterance off
  // the previous one's `onend` rather than a fixed interval, since a
  // three-language announcement doesn't take a fixed amount of time.
  //
  // Browsers (especially kiosk/Android TV Chrome) block any audio, including
  // speech synthesis, until the page has received one user gesture — so we
  // gate the whole thing behind a one-tap "Enable Sound" overlay instead of
  // hoping autoplay is allowed.
  const voicesRef = useRef([]);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return undefined;
    const loadVoices = () => { voicesRef.current = window.speechSynthesis.getVoices(); };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const pickVoice = (lang) => {
    const voices = voicesRef.current;
    if (!voices?.length) return null;
    const base = lang.split('-')[0];
    return voices.find((v) => v.lang === lang) || voices.find((v) => v.lang?.startsWith(base)) || null;
  };

  useEffect(() => {
    if (!soundEnabled || muted || !('speechSynthesis' in window)) return undefined;
    let cancelled = false;

    const speakSegment = (segments, idx, onCallDone) => {
      if (cancelled) return;
      if (idx >= segments.length) { onCallDone(); return; }
      const seg = segments[idx];
      const utter = new SpeechSynthesisUtterance(seg.text);
      utter.lang = seg.lang;
      const voice = pickVoice(seg.lang);
      if (voice) utter.voice = voice;
      utter.rate = 0.95;
      setSpeakingLang(seg.lang);
      utter.onend = () => { if (!cancelled) speakSegment(segments, idx + 1, onCallDone); };
      utter.onerror = () => { if (!cancelled) speakSegment(segments, idx + 1, onCallDone); };
      window.speechSynthesis.speak(utter);
    };

    const speakNextCall = () => {
      if (cancelled || activeCalls.length === 0) return;
      const call = activeCalls[callIndexRef.current % activeCalls.length];
      callIndexRef.current += 1;
      window.speechSynthesis.cancel();
      speakSegment(call.speeches, 0, () => {
        setSpeakingLang(null);
        if (!cancelled) speakIntervalRef.current = setTimeout(speakNextCall, 4000);
      });
    };

    speakNextCall();
    return () => {
      cancelled = true;
      clearTimeout(speakIntervalRef.current);
      window.speechSynthesis.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundEnabled, muted, activeCalls.map((c) => c.key).join(',')]);

  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const isLoading = opQuery.isLoading || labQuery.isLoading || pharmacyQuery.isLoading;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50 text-slate-900 flex flex-col">
      {/* HEADER */}
      <header className="flex items-center justify-between px-8 py-4 bg-white border-b border-slate-200 shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          {branding.logo ? (
            <img src={branding.logo} alt="logo" className="w-14 h-14 rounded-xl object-cover shadow" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#0F4C81] to-[#1976D2] flex items-center justify-center text-white shadow-lg">
              <Stethoscope className="w-7 h-7" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-extrabold text-[#0F4C81] leading-tight">{branding.hospitalName}</h1>
            <p className="text-sm text-slate-500">{branding.tagline}</p>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <div className="text-3xl font-bold text-[#1976D2] tabular-nums flex items-center gap-2">
            <Clock3 className="w-6 h-6" /> {timeStr}
          </div>
          <div className="text-sm text-slate-500">{dateStr}</div>
        </div>

        <div className="flex items-center gap-4">
          <div className="glass-card px-4 py-2 rounded-full flex items-center gap-3 shadow-sm">
            <StatPill icon={Users} label="Waiting" value={opStats.waiting} color="text-blue-700" />
            <StatPill icon={Activity} label="In Consult" value={opStats.in_consultation} color="text-emerald-700" />
            <StatPill icon={CheckCircle2} label="Completed" value={opStats.completed} color="text-slate-600" />
            <StatPill icon={CalendarClock} label="Tokens Today" value={opStats.total} color="text-indigo-700" />
          </div>
          <div className={`px-3 py-2 rounded-full flex items-center gap-2 border ${socketConnected ? 'bg-red-50 border-red-200' : 'bg-slate-100 border-slate-200'}`}>
            <div className={`w-2.5 h-2.5 rounded-full ${socketConnected ? 'bg-red-500 animate-pulse' : 'bg-slate-400'}`} />
            <span className={`text-xs font-bold ${socketConnected ? 'text-red-700' : 'text-slate-500'}`}>{socketConnected ? 'LIVE' : 'OFFLINE'}</span>
          </div>
          <button
            onClick={() => setMuted((m) => !m)}
            className="p-2 rounded-lg hover:bg-slate-100 transition"
            title={muted ? 'Unmute announcements' : 'Mute announcements'}
          >
            <Volume2 className={`w-6 h-6 ${muted || !soundEnabled ? 'text-slate-300' : 'text-slate-600'}`} />
          </button>
        </div>
      </header>

      {!soundEnabled && (
        <button
          onClick={() => setSoundEnabled(true)}
          className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center gap-3 text-white cursor-pointer"
        >
          <Volume2 className="w-14 h-14 animate-pulse" />
          <p className="text-2xl font-bold">Tap anywhere to enable voice announcements</p>
          <p className="text-sm opacity-80">Browsers require one tap before a page is allowed to play sound</p>
        </button>
      )}

      {/* MAIN GRID */}
      <div className="flex-1 grid grid-cols-4 gap-6 p-6 overflow-hidden min-h-0">
        <QueueColumn
          title="OP CONSULTATION"
          icon={Activity}
          color="blue"
          nowCallingLabel="NOW CALLING"
          nowToken={opNextCalling?.tokenNumber}
          nowSubtitle={opNextCalling?.patient?.name}
          nowDetail={[opNextCalling?.doctor?.name, opNextCalling?.department?.name].filter(Boolean).join(' • ')}
          secondary={opInConsultation ? {
            label: 'IN CONSULTATION',
            token: opInConsultation.tokenNumber,
            subtitle: opInConsultation.patient?.name,
            detail: [opInConsultation.doctor?.name, opInConsultation.department?.name].filter(Boolean).join(' • '),
          } : null}
          rows={opSorted.slice(0, 8).map((o) => ({
            id: o._id,
            token: o.tokenNumber,
            name: o.patient?.name,
            meta: `${o.patient?.age ?? '—'}${o.patient?.gender ? '/' + o.patient.gender : ''} • ${o.doctor?.name || 'Unassigned'}`,
            status: o.status,
          }))}
          emptyLabel="No patients in the OP queue right now"
        />

        <QueueColumn
          title="LAB QUEUE"
          icon={Beaker}
          color="green"
          nowCallingLabel="NOW PROCESSING"
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
          title="PHARMACY"
          icon={Pill}
          color="purple"
          nowCallingLabel="NOW SERVING"
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
          emptyLabel="No prescriptions waiting at pharmacy"
        />

        <QueueColumn
          title="ONLINE / SCHEDULED"
          icon={Globe}
          color="orange"
          nowCallingLabel="NEXT SCHEDULED"
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
          emptyLabel="No online appointments waiting"
        />
      </div>

      {/* BOTTOM ROW */}
      <div className="grid grid-cols-3 gap-6 px-6 pb-6 shrink-0" style={{ height: '30%' }}>
        <div className="glass-card rounded-2xl p-5 shadow-lg overflow-y-auto">
          <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><Users className="w-5 h-5 text-[#1976D2]" /> Doctor Availability</h3>
          <div className="space-y-2">
            {doctorRows.length === 0 && <p className="text-sm text-slate-400">No doctors on duty found.</p>}
            {doctorRows.map((doc) => (
              <div key={doc._id} className="flex items-center justify-between border-b border-slate-100 last:border-0 pb-2">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{doc.name}</p>
                  <p className="text-xs text-slate-500">{doc.specialization || doc.department?.name || 'General'}</p>
                </div>
                <div className="text-right">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    doc.status === 'In Consultation' ? 'bg-emerald-100 text-emerald-700'
                    : doc.status === 'Available' ? 'bg-blue-100 text-blue-700'
                    : 'bg-slate-100 text-slate-500'
                  }`}>{doc.status}</span>
                  <p className="text-[11px] text-slate-500 mt-1">Token {doc.currentToken} • {doc.waitingCount} waiting</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 shadow-lg overflow-y-auto">
          <h3 className="font-bold text-amber-900 mb-3 flex items-center gap-2"><Megaphone className="w-5 h-5 text-orange-600" /> Announcements</h3>
          <div className="space-y-2">
            {announcements.length === 0 && <p className="text-sm text-slate-400">No active announcements.</p>}
            {announcements.map((a, i) => (
              <p key={i} className={`text-sm font-medium ${a.color}`}>
                <span className="text-slate-400 mr-2">{a.time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                {a.text}
              </p>
            ))}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 shadow-lg flex flex-col items-center justify-center text-center">
          <Volume2 className={`w-10 h-10 mb-2 ${!soundEnabled || muted ? 'text-slate-300' : 'text-[#1976D2] animate-pulse'}`} />
          <p className="font-bold text-slate-800">
            {!soundEnabled ? 'Tap the screen to enable sound' : muted ? 'Voice Announcements Muted' : activeCalls.length === 0 ? 'Voice Ready — no active calls' : 'Voice Announcement Active'}
          </p>
          {soundEnabled && !muted && speakingLang && (
            <div className="flex items-center gap-1.5 mt-1.5">
              {LANG_BADGES.map((l) => (
                <span key={l.code} className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${speakingLang === l.code ? 'bg-[#1976D2] text-white' : 'bg-slate-100 text-slate-400'}`}>
                  {l.label}
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-500 mt-1">English → தமிழ் → हिन्दी, then next call</p>
        </div>
      </div>

      {/* FOOTER STRIP */}
      <footer className="bg-gradient-to-r from-[#0F4C81] to-[#1976D2] text-white text-xs px-8 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-1"><Volume2 className="w-3.5 h-3.5" /> Announcements in English, Tamil &amp; Hindi</span>
          <span className="flex items-center gap-1"><Wifi className="w-3.5 h-3.5" /> Live updates on all screens</span>
          <span className="flex items-center gap-1"><Globe className="w-3.5 h-3.5" /> OP • Lab • Pharmacy • Online</span>
        </div>
        <span>{branding.footerNote || 'Better Experience, Better Care'}</span>
      </footer>

      {isLoading && (
        <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
          <p className="text-slate-500 font-medium">Loading live queue data…</p>
        </div>
      )}
      {(opQuery.isError || labQuery.isError || pharmacyQuery.isError) && !isLoading && (
        <div className="absolute bottom-4 right-4 bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg flex items-center gap-2">
          <WifiOff className="w-4 h-4" /> Couldn't refresh some queues — retrying automatically.
        </div>
      )}
    </div>
  );
}

function StatPill({ icon: Icon, label, value, color }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={`w-4 h-4 ${color}`} />
      <span className={`font-bold ${color}`}>{value}</span>
      <span className="text-[11px] text-slate-500 hidden xl:inline">{label}</span>
    </div>
  );
}

const COLUMN_THEME = {
  blue: { header: 'bg-[#0F4C81]', now: 'from-[#0F4C81] to-[#1976D2]' },
  green: { header: 'bg-emerald-600', now: 'from-emerald-600 to-emerald-700' },
  purple: { header: 'bg-purple-600', now: 'from-purple-600 to-purple-700' },
  orange: { header: 'bg-orange-500', now: 'from-orange-500 to-orange-600' },
};

function QueueColumn({ title, icon: Icon, color, nowCallingLabel, nowToken, nowSubtitle, nowDetail, secondary, rows, emptyLabel }) {
  const theme = COLUMN_THEME[color];
  return (
    <div className="flex flex-col rounded-2xl overflow-hidden shadow-lg border border-slate-200 bg-white min-h-0">
      <div className={`${theme.header} text-white px-4 py-3 flex items-center gap-2 font-bold text-sm shrink-0`}>
        <Icon className="w-5 h-5" /> {title}
      </div>

      {secondary && (
        <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-2 text-center shrink-0">
          <div className="text-[10px] uppercase tracking-widest font-bold text-emerald-700">{secondary.label}</div>
          <div className="text-sm font-bold text-emerald-900">
            Token {secondary.token}{secondary.subtitle ? ` — ${secondary.subtitle}` : ''}
          </div>
          {secondary.detail && <div className="text-[11px] text-emerald-700">{secondary.detail}</div>}
        </div>
      )}

      <div className={`bg-gradient-to-br ${theme.now} text-white p-4 text-center shrink-0`}>
        <div className="text-[11px] uppercase tracking-widest opacity-90 font-bold">{nowCallingLabel}</div>
        <div className="text-5xl font-black my-1 drop-shadow">{nowToken || '—'}</div>
        {nowSubtitle && <div className="text-sm font-semibold">{nowSubtitle}</div>}
        {nowDetail && <div className="text-xs opacity-80 mt-0.5">{nowDetail}</div>}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 min-h-0">
        {rows.length === 0 && <p className="text-xs text-slate-400 text-center mt-4">{emptyLabel}</p>}
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-2 p-2 mb-1 bg-slate-50 rounded-lg text-xs">
            <span className="font-bold text-slate-700 w-14 shrink-0">{r.token}</span>
            <span className="flex-1 truncate text-slate-700 font-medium">{r.name || '—'}</span>
            <span className="hidden xl:block text-slate-500 truncate max-w-[35%]">{r.meta}</span>
            <StatusBadge status={r.status} />
          </div>
        ))}
      </div>

      <div className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-500 bg-slate-50 shrink-0">
        Showing {Math.min(8, rows.length)} of {rows.length} • auto-refresh
      </div>
    </div>
  );
}
