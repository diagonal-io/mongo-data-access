export interface IDataAccess<V, R, F, O> {
  count: (filter: F) => Promise<number>;
  delete: (filter: F) => Promise<number>;
  insert: (values: V) => Promise<string>;
  select: (filter?: F, options?: O) => Promise<R[]>;
  selectOne: (filter?: F, options?: O) => Promise<R | null>;
  update: (filter: F, values: V) => Promise<number>;
}
