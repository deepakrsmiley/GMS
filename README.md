# Hospital Management System (HMS)

A complete, corporate-level Hospital Management System built with the MERN stack.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, Framer Motion |
| State Management | Redux Toolkit + React Query |
| Backend | Node.js, Express 5 |
| Database | MongoDB + Mongoose |
| Real-time | Socket.IO |
| Auth | JWT |
| PDF | PDFKit (A4 invoice + thermal print) |
| Charts | Recharts |
| Forms | React Hook Form |

---

## Quick Start

### 1. Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- pnpm or npm

### 2. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your MongoDB URI and secrets
npm run seed   # Seed demo data + users
npm run dev    # Starts on port 5000
```

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev    # Starts on port 3000
```

### 4. Access the App

Open `http://localhost:3000`

---

## Demo Login Credentials

| Role | Email | Password |
|---|---|---|
| Super Admin | superadmin@hms.com | admin123 |
| Admin | admin@hms.com | admin123 |
| Doctor | doctor@hms.com | doctor123 |
| Receptionist | reception@hms.com | admin123 |
| Nurse | nurse@hms.com | admin123 |
| Pharmacist | pharmacy@hms.com | admin123 |
| Lab Technician | lab@hms.com | admin123 |

---

## Features

### Modules
- **Dashboard** — Live KPIs, revenue charts, queue status, bed occupancy
- **Patients** — Registration, search, history, emergency contacts
- **OP Queue** — Token generation, live queue with Socket.IO, consultation status
- **IP Admissions** — Admit/discharge, bed allocation, nursing notes, doctor rounds, transfer
- **Billing** — OP/IP/pharmacy/lab billing, GST calculations, A4 PDF invoice, thermal print (80mm)
- **Pharmacy** — Medicine inventory, batch management, low-stock alerts, expiry tracking, prescription dispensing
- **Laboratory** — Test ordering, sample collection workflow, result entry, PDF reports
- **Bed Management** — Visual bed map, ward-wise view, real-time status updates
- **Staff Management** — Role-based user management, activate/deactivate
- **Reports** — Revenue trends, department analytics, bill-type breakdown

### Security
- JWT authentication with refresh
- Role-based access control (7 roles)
- Helmet, CORS, rate limiting, MongoDB sanitization, XSS protection

### Real-time Features (Socket.IO)
- Live OP queue updates
- Bed occupancy changes
- Lab result notifications to doctors

### PDF Printing
- A4 invoice with full item breakdown (including medicines)
- 80mm thermal receipt
- Lab reports with reference ranges and flags

---

## Project Structure

```
hms/
├── backend/
│   ├── config/          # DB, Cloudinary config
│   ├── controllers/     # Business logic
│   ├── middleware/       # Auth, error handler, rate limiter
│   ├── models/          # Mongoose schemas (15+ models)
│   ├── routes/          # Express routers
│   ├── utils/           # Logger, PDF generator, ID generators
│   └── server.js        # Entry point with Socket.IO
└── frontend/
    └── src/
        ├── components/  # Common UI components
        ├── layouts/     # MainLayout (sidebar+header), AuthLayout
        ├── pages/       # One file per module page
        ├── redux/       # Store + slices (auth, ui)
        └── services/    # Axios instance, Socket.IO client
```

---

## MongoDB Models

| Model | Purpose |
|---|---|
| User | Staff & authentication |
| Patient | Patient master records |
| Department | Hospital departments |
| OPRegistration | OP visits + queue |
| IPAdmission | Inpatient admissions |
| Bed | Bed inventory + status |
| Ward | Ward management |
| Bill | Billing with full item breakdown |
| Medicine | Pharmacy inventory + batches |
| Prescription | Doctor prescriptions |
| LabTest | Lab orders + results |
| Supplier | Medicine suppliers |
| Notification | System notifications |
| ActivityLog | Audit trail |
| Appointment | Scheduled appointments |
| Counter | Auto-incrementing IDs |

---

## API Endpoints

| Module | Base Path |
|---|---|
| Auth | `/api/auth` |
| Patients | `/api/patients` |
| OP Queue | `/api/op` |
| IP Admissions | `/api/ip` |
| Billing | `/api/billing` |
| Pharmacy | `/api/pharmacy` |
| Lab | `/api/lab` |
| Beds | `/api/beds` |
| Staff | `/api/staff` |
| Dashboard | `/api/dashboard` |

---

## Known Fixed Issues

- **Medicine billing**: Medicines added to bills now correctly appear in:
  - Bill items array with `type: 'medicine'`
  - A4 PDF invoice with individual line items
  - 80mm thermal print receipt
  - GST calculations per item
  - Billing history and records

---

## Environment Variables

See `backend/.env.example` for all required variables.

---

## Production Deployment

1. Set `NODE_ENV=production` in backend `.env`
2. Build frontend: `npm run build` → serves from `dist/`
3. Serve static files from Express or deploy frontend to Vercel/Netlify
4. Use MongoDB Atlas for production database
5. Use PM2 or similar for process management
