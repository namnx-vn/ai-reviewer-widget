export interface ArchitectureRule {
  id: string;

  description: string;

  check(
    file: string,
    importedModule: string,
  ): boolean;
}