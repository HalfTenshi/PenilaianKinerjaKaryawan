interface CardSectionProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function CardSection({ title, children, className = '' }: CardSectionProps) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 shadow-sm ${className}`}>
      {title && (
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-800">{title}</h3>
        </div>
      )}
      <div className="px-6 py-4">
        {children}
      </div>
    </div>
  );
}
