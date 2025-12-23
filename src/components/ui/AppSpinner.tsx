import { Loader2 } from "lucide-react";

export default function AppSpinner() {
    return (
        <div className="flex justify-center items-center">
            <Loader2 className="animate-spin" size="50"/>
        </div>
    );
}