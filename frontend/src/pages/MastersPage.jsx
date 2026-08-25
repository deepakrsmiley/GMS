import React, { useMemo } from 'react';
import { NavLink, Navigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  Database, Building2, Bed, Package, Pill, Truck, FlaskConical,
  Syringe, Image, UserCog, Building,
} from 'lucide-react';
import { hasPermission } from '../constants/permissions';
import { normalizeRole } from '../utils/roles';
import { isHospitalModuleEnabledForUser } from '../constants/hospitalModules';
import DepartmentPage from './DepartmentPage';
import BedsPage from './BedsPage';
import AssetPage from './AssetPage';
import StaffPage from './StaffPage';
import ServiceMasterPage from './ServiceMasterPage';
import HospitalBrandingPage from './HospitalBrandingPage';
import OrganizationsPage from './OrganizationsPage';
import PharmacyPage from './PharmacyPage';
import LabTestMasterPage from './LabTestMasterPage';
import '../styles/masters.css';

const MASTER_MODULES = [
  {
    id: 'departments',
    label: 'Departments',
    description: 'Clinical departments & codes',
    icon: Building2,
    permission: 'MANAGE_DEPARTMENTS',
    group: 'Hospital',
  },
  {
    id: 'beds',
    label: 'Rooms & Beds',
    description: 'Wards, rooms & bed status',
    icon: Bed,
    permission: 'MANAGE_BEDS',
    hospitalModule: 'ip',
    group: 'Hospital',
  },
  {
    id: 'assets',
    label: 'Assets',
    description: 'Equipment register & status',
    icon: Package,
    permission: 'VIEW_ASSETS',
    hospitalModule: 'biomedical',
    group: 'Hospital',
  },
  {
    id: 'branding',
    label: 'Hospital Branding',
    description: 'Logo, GST, invoice identity',
    icon: Image,
    permission: 'MANAGE_SETTINGS',
    group: 'Hospital',
  },
  {
    id: 'medicines',
    label: 'Medicine Master',
    description: 'SKU catalog & stock levels',
    icon: Pill,
    permission: 'VIEW_PHARMACY',
    anyOf: [
      'VIEW_PHARMACY',
      'MANAGE_PHARMACY',
      'CREATE_MEDICINE',
      'EDIT_MEDICINE',
      'ADD_PHARMACY_STOCK',
      'ADJUST_PHARMACY_STOCK',
      'DELETE_MEDICINE',
    ],
    hospitalModule: 'pharmacy',
    group: 'Clinical catalog',
  },
  {
    id: 'suppliers',
    label: 'Suppliers',
    description: 'Pharmacy distributors',
    icon: Truck,
    permission: 'MANAGE_SUPPLIERS',
    anyOf: ['MANAGE_SUPPLIERS', 'MANAGE_PHARMACY'],
    hospitalModule: 'pharmacy',
    group: 'Clinical catalog',
  },
  {
    id: 'lab-tests',
    label: 'Lab Test Master',
    description: 'Test / profile price list',
    icon: FlaskConical,
    permission: 'VIEW_LAB',
    hospitalModule: 'lab',
    group: 'Clinical catalog',
  },
  {
    id: 'services',
    label: 'Services & Rates',
    description: 'Equipment & procedure charges',
    icon: Syringe,
    permission: 'MANAGE_SETTINGS',
    hospitalModulesAny: ['op', 'ip', 'billing'],
    group: 'Clinical catalog',
  },
  {
    id: 'organizations',
    label: 'Client hospitals',
    description: 'GMS Super Admin creates client hospitals (Sri Sanjeevi, Srinivasa, later hospitals)',
    icon: Building,
    permission: 'MANAGE_ORGANIZATIONS',
    superAdminOnly: true,
    group: 'Access',
  },
  {
    id: 'staff',
    label: 'Users & Access',
    description: 'Staff accounts & permissions',
    icon: UserCog,
    permission: 'MANAGE_STAFF',
    group: 'Access',
  },
];

function canSeeModule(user, module) {
  if (!user) return false;
  if (module.superAdminOnly) return normalizeRole(user.role) === 'Super Admin';
  if (module.hospitalModule && !isHospitalModuleEnabledForUser(user, module.hospitalModule)) {
    return false;
  }
  if (Array.isArray(module.hospitalModulesAny) && module.hospitalModulesAny.length) {
    const anyOn = module.hospitalModulesAny.some((id) => isHospitalModuleEnabledForUser(user, id));
    if (!anyOn) return false;
  }
  if (normalizeRole(user.role) === 'Super Admin') return true;
  if (Array.isArray(module.anyOf) && module.anyOf.length) {
    return module.anyOf.some((code) => hasPermission(user, code));
  }
  return hasPermission(user, module.permission);
}

function SectionBody({ section }) {
  switch (section) {
    case 'departments':
      return <DepartmentPage />;
    case 'beds':
      return <BedsPage />;
    case 'assets':
      return <AssetPage />;
    case 'branding':
      return <HospitalBrandingPage />;
    case 'medicines':
      return <PharmacyPage masterMode forcedTab="inventory" />;
    case 'suppliers':
      return <PharmacyPage masterMode forcedTab="distributors" />;
    case 'lab-tests':
      return <LabTestMasterPage />;
    case 'services':
      return <ServiceMasterPage />;
    case 'staff':
      return <StaffPage />;
    case 'organizations':
      return <OrganizationsPage />;
    default:
      return null;
  }
}

export default function MastersPage() {
  const { section } = useParams();
  const user = useSelector((s) => s.auth?.user);
  const modules = useMemo(
    () => MASTER_MODULES.filter((m) => canSeeModule(user, m)),
    [user]
  );

  const groups = useMemo(() => {
    const map = new Map();
    modules.forEach((m) => {
      if (!map.has(m.group)) map.set(m.group, []);
      map.get(m.group).push(m);
    });
    return [...map.entries()];
  }, [modules]);

  if (!modules.length) {
    return <Navigate to="/unauthorized" replace />;
  }

  if (!section) {
    return <Navigate to={`/masters/${modules[0].id}`} replace />;
  }

  const allowed = modules.find((m) => m.id === section);
  if (!allowed) {
    return <Navigate to={`/masters/${modules[0].id}`} replace />;
  }

  return (
    <div className="masters-shell">
      <header className="masters-masthead">
        <div>
          <p className="masters-masthead__eyebrow">Hospital configuration</p>
          <h1 className="masters-masthead__title">
            <Database size={22} className="inline-block mr-2 align-text-bottom" />
            Masters
          </h1>
          <p className="masters-masthead__sub">
            Single place for all hospital setup data — departments, beds, catalogs, rates, branding, and users.
          </p>
        </div>
      </header>

      <div className="masters-workspace">
        <aside className="masters-rail">
          <div className="masters-rail__head">Master modules</div>
          <nav className="masters-rail__nav">
            {groups.map(([group, items]) => (
              <div key={group} className="masters-rail__group">
                <p className="masters-rail__group-title">{group}</p>
                {items.map(({ id, label, description, icon: Icon }) => (
                  <NavLink
                    key={id}
                    to={`/masters/${id}`}
                    className={({ isActive }) =>
                      `masters-rail__item ${isActive ? 'is-active' : ''}`
                    }
                  >
                    <Icon size={14} className="shrink-0 mt-0.5" />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{label}</span>
                      <span className="block truncate text-[10px] opacity-70 font-normal normal-case tracking-normal">
                        {description}
                      </span>
                    </span>
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        <div className="masters-content">
          <SectionBody section={section} />
        </div>
      </div>
    </div>
  );
}
