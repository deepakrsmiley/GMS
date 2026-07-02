import React, { useState } from 'react';
import { Calendar, Plus } from 'lucide-react';

export default function AppointmentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Appointments</h1>
        <button className="btn-primary"><Plus size={16} /> Book Appointment</button>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center gap-4 text-gray-400">
        <Calendar size={48} className="text-blue-200 dark:text-blue-900" />
        <div className="text-center">
          <p className="font-semibold text-gray-600 dark:text-gray-300">Appointments Module</p>
          <p className="text-md font-bold text-red-500 mt-1 bg-white shadow-md px-6 ">Online Appointments Features Coming Soon, Stay Tune !</p>
        </div>
      </div>
    </div>
  );
}
