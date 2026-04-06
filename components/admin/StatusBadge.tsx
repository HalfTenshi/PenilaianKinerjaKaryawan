interface StatusBadgeProps {
  status: 'dinilai' | 'dikirim' | 'aktif' | 'ditutup' | 'draft';
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const statusConfig = {
    dinilai: {
      bg: 'bg-green-100',
      text: 'text-green-800',
      label: 'Dinilai',
    },
    dikirim: {
      bg: 'bg-orange-100',
      text: 'text-orange-800',
      label: 'Dikirim',
    },
    aktif: {
      bg: 'bg-green-100',
      text: 'text-green-800',
      label: 'Aktif',
    },
    ditutup: {
      bg: 'bg-gray-100',
      text: 'text-gray-800',
      label: 'Ditutup',
    },
    draft: {
      bg: 'bg-blue-100',
      text: 'text-blue-800',
      label: 'Draft',
    },
  };

  // fallback safety (anti crash)
  const config =
    statusConfig[status] ??
    {
      bg: 'bg-gray-100',
      text: 'text-gray-800',
      label: status,
    };

  return (
    <span
      className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${config.bg} ${config.text}`}
    >
      {config.label}
    </span>
  );
}