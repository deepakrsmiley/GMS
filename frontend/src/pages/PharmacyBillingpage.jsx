import { useState, useEffect, useCallback, useRef } from "react";

// ── Config ────────────────────────────────────────────────────
const API = "/api/billing";

// ── Utility ───────────────────────────────────────────────────
const fmt = (n) =>
  `₹${(+n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);

function calcTotals(items) {
  let subtotal = 0,
    disc = 0,
    tax = 0;
  items.forEach((it) => {
    const gross = (it.quantity || 0) * (it.unitPrice || 0);
    const d = (gross * (it.discount || 0)) / 100;
    const afterD = gross - d;
    const g = (afterD * (it.gstRate || 0)) / 100;
    subtotal += gross;
    disc += d;
    tax += g;
  });
  return {
    subtotal,
    discountAmount: disc,
    taxAmount: tax,
    totalAmount: Math.round((subtotal - disc + tax) * 100) / 100,
  };
}

// ── Shift: Morning 7AM-7PM | Night 7PM-7AM ───────────────────
const SHIFT_COLORS = { morning: "#f59e0b", night: "#1e40af" };
const SHIFT_LABELS = {
  morning: "Morning  7AM - 7PM",
  night: "Night  7PM - 7AM",
};

function getShiftFromDate(dateStr) {
  const h = new Date(dateStr).getHours();
  return h >= 7 && h < 19 ? "morning" : "night";
}

function ShiftBadge({ shift }) {
  const bg = SHIFT_COLORS[shift] || "#6b7280";
  const label = shift === "morning" ? "MORNING  7AM-7PM" : "NIGHT  7PM-7AM";
  return (
    <span
      style={{
        background: bg,
        color: "#fff",
        padding: "3px 12px",
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function StatusBadge({ status }) {
  const map = {
    paid: ["#dcfce7", "#16a34a"],
    partial: ["#fef9c3", "#b45309"],
    pending: ["#fee2e2", "#dc2626"],
    unpaid: ["#fee2e2", "#dc2626"],
  };
  const [bg, color] = map[status] || ["#f3f4f6", "#374151"];
  return (
    <span
      style={{
        background: bg,
        color,
        padding: "2px 10px",
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {status?.toUpperCase()}
    </span>
  );
}

// ── Main App ──────────────────────────────────────────────────
export default function PharmacyBilling() {
  const [tab, setTab] = useState("shift");
  const [bills, setBills] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editBill, setEditBill] = useState(null);
  const [payBill, setPayBill] = useState(null);
  const [msg, setMsg] = useState(null);

  const showMsg = (text, type = "success") => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 3500);
  };

  const fetchBills = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}?billType=pharmacy&limit=100`);
      const d = await r.json();
      setBills(d.data || d.bills || []);
    } catch {
      showMsg("Failed to load bills", "error");
    }
    setLoading(false);
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch(`${API}/stats`);
      const d = await r.json();
      setStats(d.data || d);
    } catch {}
  }, []);

  useEffect(() => {
    fetchBills();
    fetchStats();
  }, [fetchBills, fetchStats]);

  const TABS = [
    { id: "shift", label: "Shift Report" },
    { id: "daily", label: "Daily" },
    { id: "weekly", label: "Weekly" },
    { id: "monthly", label: "Monthly" },
    { id: "staff", label: "Staff Report" },
    { id: "bills", label: "All Bills" },
  ];

  return (
    <div
      style={{
        fontFamily: "'Inter', sans-serif",
        minHeight: "100vh",
        background: "#f1f5f9",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "#0f172a",
          color: "#fff",
          padding: "16px 28px",
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>
            Pharmacy Billing Reports
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            HMS — Shift-wise Account Settlement
          </div>
        </div>
        {stats && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 28 }}>
            <StatBox
              label="Today Bills"
              value={stats.totalBills ?? stats.today?.totalBills ?? "—"}
            />
            <StatBox
              label="Today Collected"
              value={fmt(stats.todayRevenue ?? stats.today?.totalPaid ?? 0)}
            />
            <StatBox
              label="Today Due"
              value={fmt(stats.today?.totalDue ?? 0)}
              color="#f87171"
            />
          </div>
        )}
      </div>

      {/* Toast */}
      {msg && (
        <div
          style={{
            position: "fixed",
            top: 20,
            right: 20,
            zIndex: 9999,
            background: msg.type === "error" ? "#ef4444" : "#22c55e",
            color: "#fff",
            padding: "12px 20px",
            borderRadius: 10,
            boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
            fontWeight: 600,
          }}
        >
          {msg.text}
        </div>
      )}

      {/* Tabs */}
      <div
        style={{
          background: "#fff",
          borderBottom: "2px solid #e2e8f0",
          display: "flex",
          overflowX: "auto",
          padding: "0 20px",
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "14px 22px",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontWeight: tab === t.id ? 800 : 500,
              fontSize: 14,
              whiteSpace: "nowrap",
              color: tab === t.id ? "#0f172a" : "#64748b",
              borderBottom:
                tab === t.id ? "3px solid #f59e0b" : "3px solid transparent",
              transition: "all 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: 28 }}>
        {tab === "shift" && <ShiftReport />}
        {tab === "daily" && <DailyReport />}
        {tab === "weekly" && <WeeklyReport />}
        {tab === "monthly" && <MonthlyReport />}
        {tab === "staff" && <StaffReport />}
        {tab === "bills" && (
          <BillsList
            bills={bills}
            loading={loading}
            onEdit={setEditBill}
            onPay={setPayBill}
            onRefresh={fetchBills}
          />
        )}
      </div>

      {editBill && (
        <EditBillModal
          bill={editBill}
          onClose={() => setEditBill(null)}
          onSaved={() => {
            showMsg("Bill updated!");
            setEditBill(null);
            fetchBills();
            fetchStats();
          }}
          showMsg={showMsg}
        />
      )}
      {payBill && (
        <PaymentModal
          bill={payBill}
          onClose={() => setPayBill(null)}
          onSaved={() => {
            showMsg("Payment recorded!");
            setPayBill(null);
            fetchBills();
            fetchStats();
          }}
          showMsg={showMsg}
        />
      )}
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || "#fff" }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: "#94a3b8" }}>{label}</div>
    </div>
  );
}

// ── Shift Report ──────────────────────────────────────────────
function ShiftReport() {
  const [date, setDate] = useState(today());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const printRef = useRef();

  const load = async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const url = `${API}/report/shift?from=${date}&to=${date}`;
      const r = await fetch(url);
      const d = await r.json();
      setData(d);
    } catch (e) {
      setError(e.message || "Failed to load shift report");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [date]);

  // Normalise shifts from different API shapes
  const shifts = (() => {
    if (!data) return [];
    if (Array.isArray(data.shifts)) return data.shifts;
    if (data.data && Array.isArray(data.data.shifts)) return data.data.shifts;
    if (Array.isArray(data.data)) return data.data;
    return [];
  })();

  const summary = data?.summary ?? data?.data?.summary ?? {};

  const handlePrint = () => {
    const contents = printRef.current?.innerHTML;
    const win = window.open("", "_blank");
    win.document.write(`
      <html><head><title>Shift Report - ${date}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 13px; color: #111; margin: 0; padding: 20px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th { background: #f1f5f9; padding: 8px 10px; text-align: left; font-size: 12px; color: #555; }
        td { padding: 7px 10px; border-top: 1px solid #e2e8f0; font-size: 12px; }
        .green { color: #16a34a; } .red { color: #dc2626; }
        .badge { display:inline-block; padding:2px 10px; border-radius:10px; font-size:11px; font-weight:700; color:#fff; }
        .morning { background:#f59e0b; } .night { background:#1e40af; }
        @media print { button { display: none; } }
      </style></head><body>${contents}</body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 400);
  };

  return (
    <div>
      {/* Controls */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-end",
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        <div>
          <label style={labelStyle}>Select Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={inputStyle}
          />
        </div>
        <button onClick={load} style={btnStyle("#0f172a")}>
          Load Shift Report
        </button>
        {data && shifts.length > 0 && (
          <button onClick={handlePrint} style={btnStyle("#16a34a")}>
            Print / Save PDF
          </button>
        )}
      </div>

      {loading && <Loader />}

      {/* Error */}
      {error && (
        <div
          style={{
            background: "#fee2e2",
            border: "1px solid #fca5a5",
            borderRadius: 10,
            padding: "14px 18px",
            marginBottom: 20,
            color: "#dc2626",
            fontWeight: 600,
          }}
        >
          Error: {error}
          <br />
          <span style={{ fontWeight: 400, fontSize: 12 }}>
            Check that {API}/report/shift is reachable.
          </span>
        </div>
      )}

      {/* Debug panel */}
      {data && shifts.length === 0 && !loading && (
        <div
          style={{
            background: "#fef9c3",
            border: "1px solid #fbbf24",
            borderRadius: 10,
            padding: "14px 18px",
            marginBottom: 20,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            API responded but no shift data found.
          </div>
          <div style={{ fontSize: 12, color: "#374151", marginBottom: 8 }}>
            Raw API response:
          </div>
          <pre
            style={{
              background: "#fff",
              borderRadius: 6,
              padding: 10,
              fontSize: 11,
              overflowX: "auto",
              maxHeight: 200,
              border: "1px solid #e2e8f0",
            }}
          >
            {JSON.stringify(data, null, 2)}
          </pre>
          <div style={{ fontSize: 12, marginTop: 8, color: "#92400e" }}>
            Backend must return:{" "}
            <code>{`{ shifts: [...], summary: {...} }`}</code>
            <br />
            Each bill needs a <code>shift</code> field: <code>"morning"</code>{" "}
            or <code>"night"</code>
          </div>
        </div>
      )}

      {/* Printable content */}
      {data && shifts.length > 0 && (
        <div ref={printRef}>
          {/* Report Header */}
          <div
            style={{
              textAlign: "center",
              marginBottom: 20,
              paddingBottom: 16,
              borderBottom: "2px solid #0f172a",
            }}
          >
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
              Pharmacy Shift Report
            </h1>
            <div style={{ fontSize: 14, color: "#64748b", marginTop: 4 }}>
              Date:{" "}
              <strong>
                {new Date(date).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </strong>
              &nbsp;|&nbsp; Generated:{" "}
              <strong>{new Date().toLocaleTimeString("en-IN")}</strong>
            </div>
          </div>

          {/* Grand Total Banner */}
          <div
            style={{
              background: "#0f172a",
              color: "#fff",
              borderRadius: 12,
              padding: "16px 24px",
              display: "flex",
              gap: 40,
              marginBottom: 24,
              flexWrap: "wrap",
            }}
          >
            <GrandStat label="Total Bills" value={summary.totalBills ?? 0} />
            <GrandStat
              label="Total Amount"
              value={fmt(summary.totalAmount ?? 0)}
            />
            <GrandStat
              label="Total Collected"
              value={fmt(summary.totalPaid ?? 0)}
              color="#4ade80"
            />
            <GrandStat
              label="Total Pending"
              value={fmt(summary.totalDue ?? 0)}
              color="#f87171"
            />
          </div>

          {/* Shift Summary Cards — 2 shifts side by side */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 20,
              marginBottom: 28,
            }}
          >
            {["morning", "night"].map((shiftKey) => {
              const s = shifts.find((x) => x._id === shiftKey) || {
                _id: shiftKey,
                totalBills: 0,
                totalAmount: 0,
                totalPaid: 0,
                totalDue: 0,
                cashAmount: 0,
                upiAmount: 0,
                cardAmount: 0,
              };
              return (
                <div
                  key={shiftKey}
                  style={{
                    background: "#fff",
                    borderRadius: 12,
                    border: `2px solid ${SHIFT_COLORS[shiftKey]}`,
                    padding: 20,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 14,
                    }}
                  >
                    <ShiftBadge shift={shiftKey} />
                    <span style={{ fontSize: 12, color: "#64748b" }}>
                      {shiftKey === "morning"
                        ? "07:00 AM to 07:00 PM"
                        : "07:00 PM to 07:00 AM"}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                    }}
                  >
                    <ShiftStat label="Bills" value={s.totalBills} />
                    <ShiftStat label="Total" value={fmt(s.totalAmount)} />
                    <ShiftStat
                      label="Collected"
                      value={fmt(s.totalPaid)}
                      color="#16a34a"
                    />
                    <ShiftStat
                      label="Due"
                      value={fmt(s.totalDue)}
                      color={s.totalDue > 0 ? "#dc2626" : "#16a34a"}
                    />
                  </div>
                  <div
                    style={{
                      marginTop: 14,
                      paddingTop: 10,
                      borderTop: "1px solid #f1f5f9",
                      display: "flex",
                      gap: 20,
                      fontSize: 12,
                      color: "#374151",
                    }}
                  >
                    <span>
                      Cash: <strong>{fmt(s.cashAmount)}</strong>
                    </span>
                    <span>
                      UPI: <strong>{fmt(s.upiAmount)}</strong>
                    </span>
                    <span>
                      Card: <strong>{fmt(s.cardAmount)}</strong>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Per-Shift Detailed Bill Tables */}
          {["morning", "night"].map((shiftKey) => {
            const s = shifts.find((x) => x._id === shiftKey);
            if (!s || !s.bills?.length) return null;
            return (
              <div
                key={shiftKey}
                style={{
                  background: "#fff",
                  borderRadius: 12,
                  padding: 20,
                  marginBottom: 20,
                  boxShadow: "0 1px 6px rgba(0,0,0,0.07)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 14,
                  }}
                >
                  <ShiftBadge shift={shiftKey} />
                  <span style={{ fontWeight: 700 }}>
                    {s.totalBills} Bills — Collected: {fmt(s.totalPaid)} | Due:{" "}
                    {fmt(s.totalDue)}
                  </span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 13,
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        {[
                          "#",
                          "Bill No",
                          "Patient",
                          "Time",
                          "Total",
                          "Paid",
                          "Due",
                          "Mode",
                          "Billed By",
                        ].map((h) => (
                          <th
                            key={h}
                            style={{
                              padding: "8px 10px",
                              textAlign: "left",
                              fontWeight: 700,
                              color: "#64748b",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {s.bills.map((b, i) => (
                        <tr
                          key={i}
                          style={{
                            borderTop: "1px solid #f1f5f9",
                            background: i % 2 === 0 ? "#fff" : "#fafafa",
                          }}
                        >
                          <td style={tdS}>{i + 1}</td>
                          <td
                            style={{
                              ...tdS,
                              fontWeight: 700,
                              color: "#0f172a",
                            }}
                          >
                            {b.billNumber}
                          </td>
                          <td style={tdS}>{b.patientName || "—"}</td>
                          <td style={tdS}>
                            {new Date(b.createdAt).toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td style={{ ...tdS, fontWeight: 700 }}>
                            {fmt(b.totalAmount)}
                          </td>
                          <td
                            style={{
                              ...tdS,
                              color: "#16a34a",
                              fontWeight: 700,
                            }}
                          >
                            {fmt(b.paidAmount)}
                          </td>
                          <td
                            style={{
                              ...tdS,
                              color: b.dueAmount > 0 ? "#dc2626" : "#16a34a",
                              fontWeight: 700,
                            }}
                          >
                            {fmt(b.dueAmount)}
                          </td>
                          <td style={tdS}>
                            {b.paymentMode?.toUpperCase() || "—"}
                          </td>
                          <td style={tdS}>{b.billedByName || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: "#f1f5f9", fontWeight: 700 }}>
                        <td colSpan={4} style={tdS}>
                          Shift Total
                        </td>
                        <td style={tdS}>{fmt(s.totalAmount)}</td>
                        <td style={{ ...tdS, color: "#16a34a" }}>
                          {fmt(s.totalPaid)}
                        </td>
                        <td style={{ ...tdS, color: "#dc2626" }}>
                          {fmt(s.totalDue)}
                        </td>
                        <td colSpan={2} style={tdS}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Settlement Summary */}
                <div
                  style={{
                    marginTop: 16,
                    background: "#f8fafc",
                    borderRadius: 8,
                    padding: "14px 16px",
                    fontSize: 13,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      marginBottom: 10,
                      color: "#374151",
                    }}
                  >
                    Account Settlement Summary — {SHIFT_LABELS[shiftKey]}
                  </div>
                  <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
                    <SettleStat
                      label="Cash Collected"
                      value={fmt(s.cashAmount)}
                    />
                    <SettleStat
                      label="UPI Collected"
                      value={fmt(s.upiAmount)}
                    />
                    <SettleStat
                      label="Card Collected"
                      value={fmt(s.cardAmount)}
                    />
                    <SettleStat
                      label="Total Collected"
                      value={fmt(s.totalPaid)}
                      color="#16a34a"
                      bold
                    />
                    <SettleStat
                      label="Total Pending"
                      value={fmt(s.totalDue)}
                      color="#dc2626"
                      bold
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {shifts.every((s) => !s.bills?.length) && (
            <div
              style={{
                textAlign: "center",
                padding: 60,
                color: "#94a3b8",
                background: "#fff",
                borderRadius: 12,
              }}
            >
              No pharmacy bills found for {date}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Daily Report ──────────────────────────────────────────────
function DailyReport() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const printRef = useRef();

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/report/daily?days=${days}`);
      setData(await r.json());
    } catch {}
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const handlePrint = () => {
    const win = window.open("", "_blank");
    win.document.write(`<html><head><title>Daily Report</title>
      <style>body{font-family:Arial;font-size:12px;padding:20px}table{width:100%;border-collapse:collapse}
      th{background:#f1f5f9;padding:8px;text-align:left}td{padding:7px 8px;border-top:1px solid #e2e8f0}</style>
      </head><body>${printRef.current?.innerHTML}</body></html>`);
    win.document.close();
    setTimeout(() => {
      win.print();
      win.close();
    }, 300);
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-end",
          marginBottom: 24,
        }}
      >
        <div>
          <label style={labelStyle}>Show Last (Days)</label>
          <select
            value={days}
            onChange={(e) => setDays(e.target.value)}
            style={inputStyle}
          >
            {[7, 14, 30, 60, 90].map((d) => (
              <option key={d} value={d}>
                {d} Days
              </option>
            ))}
          </select>
        </div>
        <button onClick={load} style={btnStyle("#0f172a")}>
          Load
        </button>
        {data && (
          <button onClick={handlePrint} style={btnStyle("#16a34a")}>
            Print
          </button>
        )}
      </div>
      {loading && <Loader />}
      {data && (
        <div ref={printRef}>
          <h2 style={{ marginTop: 0 }}>
            Daily Pharmacy Billing Report — Last {days} Days
          </h2>
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "0 1px 6px rgba(0,0,0,0.07)",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f1f5f9" }}>
                  {[
                    "Date",
                    "Bills",
                    "Total Amount",
                    "Collected",
                    "Due",
                    "Paid",
                    "Partial",
                    "Pending",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "12px 14px",
                        textAlign: "left",
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#64748b",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.data || []).map((row, i) => (
                  <tr
                    key={i}
                    style={{
                      borderTop: "1px solid #f1f5f9",
                      background: i % 2 === 0 ? "#fff" : "#fafafa",
                    }}
                  >
                    <td style={{ ...tdS, fontWeight: 700 }}>{row._id}</td>
                    <td style={tdS}>{row.totalBills}</td>
                    <td style={{ ...tdS, fontWeight: 700 }}>
                      {fmt(row.totalAmount)}
                    </td>
                    <td style={{ ...tdS, color: "#16a34a", fontWeight: 700 }}>
                      {fmt(row.totalPaid)}
                    </td>
                    <td
                      style={{
                        ...tdS,
                        color: row.totalDue > 0 ? "#dc2626" : "#16a34a",
                        fontWeight: 700,
                      }}
                    >
                      {fmt(row.totalDue)}
                    </td>
                    <td style={{ ...tdS, color: "#16a34a" }}>
                      {row.paidBills}
                    </td>
                    <td style={{ ...tdS, color: "#b45309" }}>
                      {row.partialBills}
                    </td>
                    <td style={{ ...tdS, color: "#dc2626" }}>
                      {row.totalBills - row.paidBills - row.partialBills}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Weekly Report ─────────────────────────────────────────────
function WeeklyReport() {
  const [weeks, setWeeks] = useState(8);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const printRef = useRef();

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/report/weekly?weeks=${weeks}`);
      setData(await r.json());
    } catch {}
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const handlePrint = () => {
    const win = window.open("", "_blank");
    win.document.write(`<html><head><title>Weekly Report</title>
      <style>body{font-family:Arial;font-size:12px;padding:20px}table{width:100%;border-collapse:collapse}
      th{background:#f1f5f9;padding:8px;text-align:left}td{padding:7px 8px;border-top:1px solid #e2e8f0}</style>
      </head><body>${printRef.current?.innerHTML}</body></html>`);
    win.document.close();
    setTimeout(() => {
      win.print();
      win.close();
    }, 300);
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-end",
          marginBottom: 24,
        }}
      >
        <div>
          <label style={labelStyle}>Show Last (Weeks)</label>
          <select
            value={weeks}
            onChange={(e) => setWeeks(e.target.value)}
            style={inputStyle}
          >
            {[4, 8, 12, 24, 52].map((w) => (
              <option key={w} value={w}>
                {w} Weeks
              </option>
            ))}
          </select>
        </div>
        <button onClick={load} style={btnStyle("#0f172a")}>
          Load
        </button>
        {data && (
          <button onClick={handlePrint} style={btnStyle("#16a34a")}>
            Print
          </button>
        )}
      </div>
      {loading && <Loader />}
      {data && (
        <div ref={printRef}>
          <h2 style={{ marginTop: 0 }}>Weekly Pharmacy Billing Report</h2>
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "0 1px 6px rgba(0,0,0,0.07)",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f1f5f9" }}>
                  {[
                    "Week",
                    "Bills",
                    "Total",
                    "Collected",
                    "Due",
                    "Paid",
                    "Partial",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "12px 14px",
                        textAlign: "left",
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#64748b",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.data || []).map((row, i) => (
                  <tr
                    key={i}
                    style={{
                      borderTop: "1px solid #f1f5f9",
                      background: i % 2 === 0 ? "#fff" : "#fafafa",
                    }}
                  >
                    <td style={{ ...tdS, fontWeight: 700 }}>{row._id}</td>
                    <td style={tdS}>{row.totalBills}</td>
                    <td style={{ ...tdS, fontWeight: 700 }}>
                      {fmt(row.totalAmount)}
                    </td>
                    <td style={{ ...tdS, color: "#16a34a", fontWeight: 700 }}>
                      {fmt(row.totalPaid)}
                    </td>
                    <td
                      style={{
                        ...tdS,
                        color: row.totalDue > 0 ? "#dc2626" : "#16a34a",
                        fontWeight: 700,
                      }}
                    >
                      {fmt(row.totalDue)}
                    </td>
                    <td style={{ ...tdS, color: "#16a34a" }}>
                      {row.paidBills}
                    </td>
                    <td style={{ ...tdS, color: "#b45309" }}>
                      {row.partialBills}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Monthly Report ────────────────────────────────────────────
function MonthlyReport() {
  const [months, setMonths] = useState(12);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const printRef = useRef();

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/report/monthly?months=${months}`);
      setData(await r.json());
    } catch {}
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const handlePrint = () => {
    const win = window.open("", "_blank");
    win.document.write(`<html><head><title>Monthly Report</title>
      <style>body{font-family:Arial;font-size:12px;padding:20px}table{width:100%;border-collapse:collapse}
      th{background:#f1f5f9;padding:8px;text-align:left}td{padding:7px 8px;border-top:1px solid #e2e8f0}</style>
      </head><body>${printRef.current?.innerHTML}</body></html>`);
    win.document.close();
    setTimeout(() => {
      win.print();
      win.close();
    }, 300);
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-end",
          marginBottom: 24,
        }}
      >
        <div>
          <label style={labelStyle}>Show Last (Months)</label>
          <select
            value={months}
            onChange={(e) => setMonths(e.target.value)}
            style={inputStyle}
          >
            {[3, 6, 12, 24].map((m) => (
              <option key={m} value={m}>
                {m} Months
              </option>
            ))}
          </select>
        </div>
        <button onClick={load} style={btnStyle("#0f172a")}>
          Load
        </button>
        {data && (
          <button onClick={handlePrint} style={btnStyle("#16a34a")}>
            Print
          </button>
        )}
      </div>
      {loading && <Loader />}
      {data && (
        <div ref={printRef}>
          <h2 style={{ marginTop: 0 }}>Monthly Pharmacy Billing Report</h2>
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "0 1px 6px rgba(0,0,0,0.07)",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f1f5f9" }}>
                  {[
                    "Month",
                    "Bills",
                    "Total",
                    "Collected",
                    "Due",
                    "Paid",
                    "Partial",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "12px 14px",
                        textAlign: "left",
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#64748b",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.data || []).map((row, i) => (
                  <tr
                    key={i}
                    style={{
                      borderTop: "1px solid #f1f5f9",
                      background: i % 2 === 0 ? "#fff" : "#fafafa",
                    }}
                  >
                    <td style={{ ...tdS, fontWeight: 700 }}>{row._id}</td>
                    <td style={tdS}>{row.totalBills}</td>
                    <td style={{ ...tdS, fontWeight: 700 }}>
                      {fmt(row.totalAmount)}
                    </td>
                    <td style={{ ...tdS, color: "#16a34a", fontWeight: 700 }}>
                      {fmt(row.totalPaid)}
                    </td>
                    <td
                      style={{
                        ...tdS,
                        color: row.totalDue > 0 ? "#dc2626" : "#16a34a",
                        fontWeight: 700,
                      }}
                    >
                      {fmt(row.totalDue)}
                    </td>
                    <td style={{ ...tdS, color: "#16a34a" }}>
                      {row.paidBills}
                    </td>
                    <td style={{ ...tdS, color: "#b45309" }}>
                      {row.partialBills}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Staff Report ──────────────────────────────────────────────
function StaffReport() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const printRef = useRef();

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/report/staff?from=${from}&to=${to}`);
      setData(await r.json());
    } catch {}
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const grouped = data?.data?.reduce((acc, row) => {
    const key = row.staffName || "Unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  const handlePrint = () => {
    const win = window.open("", "_blank");
    win.document.write(`<html><head><title>Staff Settlement</title>
      <style>body{font-family:Arial;font-size:12px;padding:20px}table{width:100%;border-collapse:collapse}
      th{background:#f1f5f9;padding:8px;text-align:left}td{padding:7px 8px;border-top:1px solid #e2e8f0}</style>
      </head><body>${printRef.current?.innerHTML}</body></html>`);
    win.document.close();
    setTimeout(() => {
      win.print();
      win.close();
    }, 300);
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-end",
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        <div>
          <label style={labelStyle}>From Date</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>To Date</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            style={inputStyle}
          />
        </div>
        <button onClick={load} style={btnStyle("#0f172a")}>
          Load
        </button>
        {data && (
          <button onClick={handlePrint} style={btnStyle("#16a34a")}>
            Print Settlement
          </button>
        )}
      </div>
      {loading && <Loader />}
      {grouped && (
        <div ref={printRef}>
          <h2 style={{ marginTop: 0 }}>
            Staff / Pharmacist Shift Settlement — {from} to {to}
          </h2>
          {Object.entries(grouped).map(([name, rows]) => {
            const totBills = rows.reduce((s, r) => s + r.totalBills, 0);
            const totAmt = rows.reduce((s, r) => s + r.totalAmount, 0);
            const totPaid = rows.reduce((s, r) => s + r.totalPaid, 0);
            const totDue = rows.reduce((s, r) => s + r.totalDue, 0);
            const totCash = rows.reduce((s, r) => s + r.cashCollected, 0);
            const totUpi = rows.reduce((s, r) => s + r.upiCollected, 0);
            const totCard = rows.reduce((s, r) => s + r.cardCollected, 0);
            return (
              <div
                key={name}
                style={{
                  background: "#fff",
                  borderRadius: 12,
                  padding: 20,
                  marginBottom: 20,
                  boxShadow: "0 1px 6px rgba(0,0,0,0.07)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 16,
                    paddingBottom: 14,
                    borderBottom: "2px solid #f1f5f9",
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0, fontSize: 17 }}>{name}</h3>
                    <div
                      style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}
                    >
                      {totBills} bills | Total Billed: {fmt(totAmt)}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 20 }}>
                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 800,
                          color: "#16a34a",
                        }}
                      >
                        {fmt(totPaid)}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>
                        Total Collected
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 800,
                          color: "#dc2626",
                        }}
                      >
                        {fmt(totDue)}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>
                        Total Pending
                      </div>
                    </div>
                  </div>
                </div>

                {/* Payment mode boxes */}
                <div
                  style={{
                    display: "flex",
                    gap: 16,
                    marginBottom: 16,
                    flexWrap: "wrap",
                  }}
                >
                  {[
                    ["Cash", totCash, "#f0fdf4", "#16a34a"],
                    ["UPI", totUpi, "#eff6ff", "#2563eb"],
                    ["Card", totCard, "#faf5ff", "#7c3aed"],
                  ].map(([label, val, bg, color]) => (
                    <div
                      key={label}
                      style={{
                        background: bg,
                        borderRadius: 8,
                        padding: "10px 18px",
                        textAlign: "center",
                      }}
                    >
                      <div style={{ fontWeight: 800, color }}>{fmt(val)}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>
                        {label}
                      </div>
                    </div>
                  ))}
                </div>

                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {[
                        "Shift",
                        "Timing",
                        "Bills",
                        "Total Billed",
                        "Collected",
                        "Due",
                        "Cash",
                        "UPI",
                        "Card",
                      ].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "8px 10px",
                            textAlign: "left",
                            fontWeight: 700,
                            color: "#64748b",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} style={{ borderTop: "1px solid #f1f5f9" }}>
                        <td style={tdS}>
                          <ShiftBadge shift={r._id?.shift || r.shift} />
                        </td>
                        <td style={{ ...tdS, fontSize: 11, color: "#64748b" }}>
                          {(r._id?.shift || r.shift) === "morning"
                            ? "7AM-7PM"
                            : "7PM-7AM"}
                        </td>
                        <td style={tdS}>{r.totalBills}</td>
                        <td style={{ ...tdS, fontWeight: 700 }}>
                          {fmt(r.totalAmount)}
                        </td>
                        <td
                          style={{ ...tdS, color: "#16a34a", fontWeight: 700 }}
                        >
                          {fmt(r.totalPaid)}
                        </td>
                        <td
                          style={{
                            ...tdS,
                            color: r.totalDue > 0 ? "#dc2626" : "#16a34a",
                            fontWeight: 700,
                          }}
                        >
                          {fmt(r.totalDue)}
                        </td>
                        <td style={tdS}>{fmt(r.cashCollected)}</td>
                        <td style={tdS}>{fmt(r.upiCollected)}</td>
                        <td style={tdS}>{fmt(r.cardCollected || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
          {grouped && Object.keys(grouped).length === 0 && (
            <div
              style={{
                textAlign: "center",
                padding: 60,
                color: "#94a3b8",
                background: "#fff",
                borderRadius: 12,
              }}
            >
              No data found for selected date range
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── All Bills List ────────────────────────────────────────────
function BillsList({ bills, loading, onEdit, onPay, onRefresh }) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
          All Pharmacy Bills
        </h2>
        <button onClick={onRefresh} style={btnStyle("#0f172a")}>
          Refresh
        </button>
      </div>
      {loading ? (
        <Loader />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              background: "#fff",
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "0 1px 6px rgba(0,0,0,0.07)",
            }}
          >
            <thead>
              <tr style={{ background: "#f1f5f9" }}>
                {[
                  "Bill #",
                  "Patient",
                  "Date",
                  "Shift",
                  "Total",
                  "Paid",
                  "Due",
                  "Status",
                  "Actions",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "12px 14px",
                      textAlign: "left",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#64748b",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b._id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={tdS}>
                    <span style={{ fontWeight: 700 }}>{b.billNumber}</span>
                  </td>
                  <td style={tdS}>{b.patient?.name || "—"}</td>
                  <td style={tdS}>
                    {new Date(b.createdAt).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td style={tdS}>
                    <ShiftBadge shift={getShiftFromDate(b.createdAt)} />
                  </td>
                  <td style={{ ...tdS, fontWeight: 700 }}>
                    {fmt(b.totalAmount)}
                  </td>
                  <td style={{ ...tdS, color: "#16a34a", fontWeight: 700 }}>
                    {fmt(b.paidAmount)}
                  </td>
                  <td
                    style={{
                      ...tdS,
                      color: b.dueAmount > 0 ? "#dc2626" : "#16a34a",
                      fontWeight: 700,
                    }}
                  >
                    {fmt(b.dueAmount)}
                  </td>
                  <td style={tdS}>
                    <StatusBadge status={b.status} />
                  </td>
                  <td style={tdS}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => onEdit(b)}
                        style={btnSmall("#3b82f6")}
                      >
                        Edit
                      </button>
                      {b.dueAmount > 0 && (
                        <button
                          onClick={() => onPay(b)}
                          style={btnSmall("#16a34a")}
                        >
                          Pay
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {bills.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    style={{
                      padding: 40,
                      textAlign: "center",
                      color: "#94a3b8",
                    }}
                  >
                    No bills found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Edit Bill Modal ───────────────────────────────────────────
function EditBillModal({ bill, onClose, onSaved, showMsg }) {
  const [items, setItems] = useState(
    (bill.items || []).map((it) => ({ ...it })),
  );
  const [saving, setSaving] = useState(false);
  const totals = calcTotals(items);

  const updateItem = (i, field, val) => {
    const next = [...items];
    next[i] = {
      ...next[i],
      [field]:
        field === "description" || field === "medicineName" ? val : +val || 0,
    };
    setItems(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`${API}/${bill._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          reason: "Bill edited from pharmacy billing",
        }),
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.message);
      }
      onSaved();
    } catch (e) {
      showMsg(e.message, "error");
    }
    setSaving(false);
  };

  return (
    <Modal title={`Edit Bill — ${bill.billNumber}`} onClose={onClose}>
      <div
        style={{
          background: "#fef9c3",
          border: "1px solid #fbbf24",
          borderRadius: 8,
          padding: "10px 14px",
          marginBottom: 16,
          fontSize: 13,
        }}
      >
        Editing qty/price will recalculate the total. If new total is less than
        paid, due becomes Rs.0.
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Medicine", "Qty", "Unit Price", "Line Total"].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "8px 10px",
                    textAlign: "left",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#64748b",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const lineTotal = (it.quantity || 0) * (it.unitPrice || 0);
              return (
                <tr key={i} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "6px 8px" }}>
                    {it.description || it.name || it.medicineName || "—"}
                  </td>
                  <td style={{ padding: "6px 8px", width: 80 }}>
                    <input
                      type="number"
                      min={1}
                      value={it.quantity}
                      onChange={(e) =>
                        updateItem(i, "quantity", e.target.value)
                      }
                      style={{ ...inputStyle, width: 70 }}
                    />
                  </td>
                  <td style={{ padding: "6px 8px", width: 110 }}>
                    <input
                      type="number"
                      step="0.01"
                      value={it.unitPrice}
                      onChange={(e) =>
                        updateItem(i, "unitPrice", e.target.value)
                      }
                      style={{ ...inputStyle, width: 100 }}
                    />
                  </td>
                  <td style={{ padding: "6px 8px", fontWeight: 700 }}>
                    {fmt(lineTotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginTop: 20,
        }}
      >
        <div
          style={{
            background: "#f8fafc",
            borderRadius: 10,
            padding: 16,
            fontSize: 13,
          }}
        >
          <RowPair label="New Total" val={fmt(totals.totalAmount)} bold />
          <RowPair
            label="Already Paid"
            val={fmt(bill.paidAmount)}
            color="#16a34a"
          />
          <RowPair
            label="New Due"
            val={fmt(Math.max(0, totals.totalAmount - (bill.paidAmount || 0)))}
            color="#dc2626"
            bold
          />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={btnStyle("#64748b")}>
            Cancel
          </button>
          <button onClick={save} disabled={saving} style={btnStyle("#0f172a")}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Payment Modal ─────────────────────────────────────────────
function PaymentModal({ bill, onClose, onSaved, showMsg }) {
  const [amount, setAmount] = useState((bill.dueAmount || 0).toFixed(2));
  const [method, setMethod] = useState("cash");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return showMsg("Enter valid amount", "error");
    if (amt > (bill.dueAmount || 0) + 0.01)
      return showMsg(
        `Cannot pay more than due ${fmt(bill.dueAmount)}`,
        "error",
      );
    setSaving(true);
    try {
      const r = await fetch(`${API}/${bill._id}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, mode: method }),
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.message);
      }
      onSaved();
    } catch (e) {
      showMsg(e.message, "error");
    }
    setSaving(false);
  };

  return (
    <Modal title={`Collect Payment — ${bill.billNumber}`} onClose={onClose}>
      <div style={{ marginBottom: 16 }}>
        <RowPair label="Total Amount:" val={fmt(bill.totalAmount)} />
        <RowPair
          label="Already Paid:"
          val={fmt(bill.paidAmount)}
          color="#16a34a"
        />
        <div
          style={{
            borderTop: "2px solid #0f172a",
            paddingTop: 8,
            marginTop: 4,
          }}
        >
          <RowPair
            label="Due Amount:"
            val={fmt(bill.dueAmount)}
            color="#dc2626"
            bold
          />
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Amount to Collect (Rs.)</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>Payment Method</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["cash", "card", "upi", "insurance"].map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              style={{
                padding: "8px 16px",
                border: `2px solid ${method === m ? "#0f172a" : "#e2e8f0"}`,
                borderRadius: 8,
                background: method === m ? "#0f172a" : "#fff",
                color: method === m ? "#fff" : "#374151",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div
        style={{
          marginTop: 20,
          display: "flex",
          gap: 10,
          justifyContent: "flex-end",
        }}
      >
        <button onClick={onClose} style={btnStyle("#64748b")}>
          Cancel
        </button>
        <button onClick={save} disabled={saving} style={btnStyle("#16a34a")}>
          {saving ? "..." : "Collect Payment"}
        </button>
      </div>
    </Modal>
  );
}

// ── Shared UI ─────────────────────────────────────────────────
function Modal({ title, children, onClose }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 28,
          maxWidth: 820,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 22,
              cursor: "pointer",
              color: "#64748b",
            }}
          >
            X
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function GrandStat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || "#fff" }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}
function ShiftStat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, color: color || "#0f172a" }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: "#94a3b8" }}>{label}</div>
    </div>
  );
}
function SettleStat({ label, value, color, bold }) {
  return (
    <div>
      <div
        style={{
          fontSize: bold ? 16 : 14,
          fontWeight: bold ? 800 : 600,
          color: color || "#0f172a",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: "#94a3b8" }}>{label}</div>
    </div>
  );
}
function RowPair({ label, val, bold, color }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        marginBottom: 6,
        gap: 32,
      }}
    >
      <span style={{ fontSize: 13, color: "#64748b" }}>{label}</span>
      <span
        style={{
          fontSize: 13,
          fontWeight: bold ? 800 : 600,
          color: color || "#0f172a",
        }}
      >
        {val}
      </span>
    </div>
  );
}
function Loader() {
  return (
    <div
      style={{
        textAlign: "center",
        padding: 40,
        color: "#94a3b8",
        fontSize: 15,
      }}
    >
      Loading...
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────
const tdS = { padding: "9px 12px", fontSize: 13, color: "#374151" };
const inputStyle = {
  padding: "8px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  fontSize: 13,
  outline: "none",
  background: "#fff",
  width: "100%",
  boxSizing: "border-box",
};
const labelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 5,
  color: "#374151",
};
const btnStyle = (bg) => ({
  background: bg,
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 20px",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 14,
});
const btnSmall = (bg) => ({
  background: bg,
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "5px 12px",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 12,
});
