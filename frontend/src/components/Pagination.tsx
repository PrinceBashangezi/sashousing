'use client';

type PaginationProps = {
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    scrollTargetId?: string;
};

export default function Pagination({
    page,
    totalPages,
    onPageChange,
    scrollTargetId,
}: PaginationProps) {
    if (totalPages <= 1) return null;

    const changePage = (nextPage: number) => {
        onPageChange(nextPage);
        const target = scrollTargetId
            ? document.getElementById(scrollTargetId)
            : null;
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <div className="mt-6 flex items-center justify-center gap-3">
            <button
                type="button"
                disabled={page === 1}
                onClick={() => changePage(page - 1)}
                className="rounded-md border border-sas-green px-3 py-2 text-sm text-sas-green disabled:opacity-40"
            >
                Previous
            </button>
            <span className="text-sm text-sas-black/65">
                Page {page} of {totalPages}
            </span>
            <button
                type="button"
                disabled={page === totalPages}
                onClick={() => changePage(page + 1)}
                className="rounded-md border border-sas-green px-3 py-2 text-sm text-sas-green disabled:opacity-40"
            >
                Next
            </button>
        </div>
    );
}
