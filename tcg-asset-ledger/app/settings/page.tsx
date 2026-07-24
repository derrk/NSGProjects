import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { WipeInventoryButton } from "./wipe-inventory-button";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Account and data management." />

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Irreversible actions. Use with care.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WipeInventoryButton />
        </CardContent>
      </Card>
    </div>
  );
}
