import SiteHeader from '@/components/SiteHeader';

export default function HousingLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <>
            <SiteHeader />
            {children}
        </>
    );
}
