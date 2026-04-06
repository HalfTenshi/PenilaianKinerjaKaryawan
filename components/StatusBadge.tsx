interface StatusBadgeProps {
  status: 'Draft' | 'Dikirim' | 'Dinilai' | 'Aktif';
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const statusStyles = {
    Draft: 'bg-yellow-100 text-yellow-800',
    Dikirim: 'bg-blue-100 text-blue-800',
    Dinilai: 'bg-green-100 text-green-800',
    Aktif: 'bg-green-100 text-green-800',
  };

  return (
    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${statusStyles[status]}`}>
      {status}
    </span>
  );
}
