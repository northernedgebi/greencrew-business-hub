import { Checkbox } from "@/components/ui/checkbox";
import { CustomerServiceFields } from "@/components/customer-service-fields";
import { SERVICE_CATEGORIES, categoryServiceForm, type ServiceForm } from "@/lib/customer-services";

export function CustomerServiceSelection({ value, onChange, crews }: { value: ServiceForm[]; onChange: (value: ServiceForm[]) => void; crews: { id: string; name: string }[] }) {
  return <section className="space-y-4 border-t pt-4">
    <h3 className="font-bold">Customer services</h3>
    <div className="grid gap-2 sm:grid-cols-2">{SERVICE_CATEGORIES.map(c => <label key={c.value} className="flex min-h-11 cursor-pointer items-center gap-3">
      <Checkbox aria-label={c.label} checked={value.some(s => s.kind === c.value)} onCheckedChange={checked => onChange(checked ? [...value, categoryServiceForm(c.value)] : value.filter(s => s.kind !== c.value))} />{c.label}
    </label>)}</div>
    {value.length === 0 && <p role="alert" className="text-sm text-destructive">Select at least one service.</p>}
    {value.map((s, index) => <div key={s.kind} className="space-y-3 border-t pt-4"><h4 className="font-bold">{SERVICE_CATEGORIES.find(c => c.value === s.kind)?.label}</h4>
      <CustomerServiceFields idPrefix={`onboard-${s.kind}`} value={s} onChange={next => onChange(value.map((item, i) => i === index ? next : item))} crews={crews} />
    </div>)}
  </section>;
}