import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export default function Modal({ isOpen, onClose, title, subtitle, children, size = 'md', headerActions }) {
  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-6xl',
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            className={`relative bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-blue-100 dark:border-gray-700 w-full ${sizes[size]} max-h-[90vh] overflow-hidden z-10`}
          >
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-blue-100/80 bg-gradient-to-r from-white to-blue-50/50 dark:from-gray-800 dark:to-gray-800">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-800 dark:text-white tracking-tight">{title}</h2>
                {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {headerActions}
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-blue-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto max-h-[calc(90vh-88px)]">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
