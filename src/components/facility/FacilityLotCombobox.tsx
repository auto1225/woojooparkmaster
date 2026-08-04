import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type FacilityLotOption = {
  id: string;
  name: string;
  code?: string | null;
};

type FacilityLotComboboxProps = {
  lots: FacilityLotOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function FacilityLotCombobox({
  lots,
  value,
  onValueChange,
  placeholder = "주차장 선택",
  disabled,
}: FacilityLotComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = lots.find((lot) => lot.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={disabled}
        >
          <span className="truncate">
            {selected ? `${selected.name}${selected.code ? ` (${selected.code})` : ""}` : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="z-[100] w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder="주차장명 또는 코드 검색" />
          <CommandList>
            <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
            <CommandGroup>
              {lots.map((lot) => (
                <CommandItem
                  key={lot.id}
                  value={`${lot.name} ${lot.code || ""}`}
                  onSelect={() => {
                    onValueChange(lot.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === lot.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{lot.name}</span>
                  {lot.code && <span className="ml-auto text-xs text-muted-foreground">{lot.code}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
