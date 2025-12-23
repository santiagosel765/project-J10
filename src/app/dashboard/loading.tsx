import AppSpinner from "@/components/ui/AppSpinner";

export default function Loading() {
    return (
        <div className="min-h-[calc(100vh-theme(spacing.16)-theme(spacing.12))]">
            <AppSpinner/>
        </div>
    );
}