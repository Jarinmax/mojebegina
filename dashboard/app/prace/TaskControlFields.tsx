// Práce 2.0 — nastavení kontroly úkolu (fotografie, schválení), sdílené
// formulářem pro zadání i úpravu. Bez nastaveného úložiště fotek nejde
// fotografii vyžadovat (server to navíc odmítne).
export default function TaskControlFields({
  photosEnabled,
  photoRequirement,
  requiresApproval,
  inputClass,
}: {
  photosEnabled: boolean;
  photoRequirement: string;
  requiresApproval: boolean;
  inputClass: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3">
      <label className="text-xs text-neutral-500">
        Fotografie
        <select name="photoRequirement" defaultValue={photoRequirement} className={`${inputClass} mt-1`}>
          <option value="none">Fotografie není vyžadována</option>
          <option value="required" disabled={!photosEnabled}>Fotografie je povinná pro dokončení</option>
          <option value="optional" disabled={!photosEnabled}>Fotografie je volitelná</option>
        </select>
        {!photosEnabled && <span className="block mt-1 text-xs text-orange-700">Ukládání fotografií zatím není nastavené.</span>}
      </label>
      <label className="flex items-center gap-3 min-h-11 text-sm text-begina-primary-900">
        <input type="checkbox" name="requiresApproval" defaultChecked={requiresApproval} className="h-5 w-5" />
        Vyžaduje schválení vedoucím
      </label>
    </div>
  );
}
