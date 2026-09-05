export type AnimalCategoryOption = {
  value: string;
  label: string;
};

/**
 * Curated animal categories shared by buyer-facing marketplace filters.
 * Custom seller-entered categories remain valid listings but are not promoted
 * to permanent marketplace filter options automatically.
 */
export const ANIMAL_CATEGORY_OPTIONS: AnimalCategoryOption[] = [
  { value: "Pigeon", label: "Pigeons (Flagship)" },
  { value: "Chicken", label: "Chickens" },
  { value: "Dog", label: "Dogs" },
  { value: "Horse", label: "Horses" },
  { value: "Cat", label: "Cats" },
  { value: "Goat", label: "Goats" },
  { value: "Sheep", label: "Sheep" },
  { value: "Cattle", label: "Cattle" },
  { value: "Pig", label: "Pigs" },
  { value: "Rabbit", label: "Rabbits" },
  { value: "Turkey", label: "Turkeys" },
  { value: "Duck", label: "Ducks" },
  { value: "Guinea Fowl", label: "Guinea Fowl" },
  { value: "Quail", label: "Quails" },
  { value: "Goose", label: "Geese" },
  { value: "Peacock", label: "Peacocks" },
  { value: "Ostrich", label: "Ostriches" },
  { value: "Donkey", label: "Donkeys" },
  { value: "Camel", label: "Camels" },
  { value: "Grasscutter", label: "Grasscutters" },
  { value: "Snail", label: "Snails" },
  { value: "Fish", label: "Fish" },
  { value: "Guinea Pig", label: "Guinea Pigs" },
  { value: "Other Bird", label: "Other Birds" },
];

export function animalCategoryLabel(category: string) {
  return ANIMAL_CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? category;
}
