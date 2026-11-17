import NewLeadForm from "./NewLeadForm";

export default function NewLeadPage() {
  return (
    <div>

      <div className="mt-3 mb-5">
        <h1 className="text-lg font-medium text-begina-primary-900">Nový lead</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Zakládá se s tebou jako obchodníkem — přeřadit ho jde kdykoliv později na detailu.
        </p>
      </div>

      <div className="max-w-md">
        <NewLeadForm />
      </div>
    </div>
  );
}
