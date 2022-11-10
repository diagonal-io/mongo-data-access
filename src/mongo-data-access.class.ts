import {
  Collection,
  Db,
  Document,
  Filter,
  FindOptions,
  MongoClient,
  ObjectId,
  UpdateFilter,
} from "mongodb";
import { IDataAccess } from "./data-access.interface";

type Connection = Db;
type Suggested<T> = Document & T;
type FieldsProps = { [key: string]: string };

export interface DataAccessOptions {
  fieldsProps?: FieldsProps;
  idFields?: (string | RegExp)[];
}

const logPrefix = "[MongoDataAccess]";

export class MongoDataAccess<T>
  implements IDataAccess<Suggested<T>, Document, Filter<T>, FindOptions>
{
  readonly collection: Collection;
  private fieldsPropsMap: Map<string, string>;
  private idFields: (string | RegExp)[] = [];

  constructor(
    private connection: Connection,
    private collectionName: string,
    options?: DataAccessOptions
  ) {
    this.collection = connection.collection(collectionName);
    const { fieldsProps, idFields } = options ?? {};
    this.fieldsPropsMap = new Map(Object.entries(fieldsProps ?? {}));
    this.idFields = idFields ?? [];
  }

  static createConnection(uri: string, database: string) {
    const client = new MongoClient(uri);
    client.connect();

    client.on("open", () => {
      console.log(logPrefix, "Connected to databse:", database);
    });

    client.on("error", () => {
      console.log(logPrefix, "Error connecting to database:", database);
    });

    client.on("timeout", () => {
      console.log(logPrefix, "Error connecting to database:", database);
    });

    client.on("close", () => {
      console.log(logPrefix, "Disconnected from database:", database);
    });

    return client.db(database);
  }

  async count(filter: Filter<T>): Promise<number> {
    return this.collection.countDocuments(filter as Document);
  }

  async delete(filter: Filter<T>): Promise<number> {
    return (await this.collection.deleteMany(filter as Document)).deletedCount;
  }

  async drop(sure: boolean): Promise<boolean> {
    if (sure) {
      const filter = { name: this.collectionName };
      const collections = await this.connection
        .listCollections(filter)
        .toArray();

      if (collections.length > 1) {
        throw new Error(
          `More than 1 collection found with name: ${this.collectionName}`
        );
      }

      if (collections.length === 1) {
        await this.collection.drop();
      }

      return true;
    }
    return false;
  }

  async insert(data: Suggested<T>): Promise<string> {
    const mappedData = this.mapDataToDocument(data);
    const parsedData = this.parseStringsIDs(mappedData);
    const document = await this.collection.insertOne(parsedData);
    return `${document.insertedId}`;
  }

  private mapDataToDocument(data: Suggested<T> | Filter<T>): Document {
    if (data === null) return {};
    const dataObject: Document = Object.assign({}, data);
    const document: Document = Object.assign({}, dataObject);
    for (const [field, prop] of this.fieldsPropsMap.entries()) {
      if (Object.prototype.hasOwnProperty.call(dataObject, prop)) {
        const value = dataObject[prop];
        document[field] = value;
        delete document[prop];
      }
    }
    const { _id } = document;
    if (_id == null) {
      delete document["_id"];
    }

    return document;
  }

  private mapDocumentToData<R = Document>(document: Document): R {
    const documentObject: Document = Object.assign({}, document);
    const data: Document = {};
    for (const fieldName in documentObject) {
      if (Object.prototype.hasOwnProperty.call(documentObject, fieldName)) {
        const value = documentObject[fieldName];
        const prop = this.fieldsPropsMap.get(fieldName) ?? fieldName;
        data[prop] = value;
      }
    }
    return data as R;
  }

  private parseStringsIDs(document: Document): Document {
    const parseValue = (value: ObjectId | string): ObjectId | string => {
      if (value instanceof ObjectId) {
        return value.toString();
      } else {
        return new ObjectId(value);
      }
    };

    for (const key in document) {
      if (Object.prototype.hasOwnProperty.call(document, key)) {
        const value = document[key];
        for (const fieldSelector of this.idFields) {
          if (fieldSelector instanceof RegExp && key.match(fieldSelector)) {
            if (value instanceof Array) {
              document[key] = value.map((item) => parseValue(item));
            } else {
              document[key] = parseValue(value);
            }
          } else if (key === fieldSelector) {
            document[key] = parseValue(value);
          }
        }
      }
    }
    return document;
  }

  async select(filter?: Filter<T>, options?: FindOptions): Promise<Document[]> {
    const parsedFilter = this.mapDataToDocument(filter ?? {});
    const documents = this.collection.find(parsedFilter, options);
    const parsedDocuments = documents.map((document) => {
      const mappedData = this.mapDocumentToData(document);
      return this.parseStringsIDs(mappedData);
    });
    return await parsedDocuments.toArray();
  }

  async selectOne(
    filter?: Filter<T>,
    options?: FindOptions
  ): Promise<Document | null> {
    const parsedFilter = this.mapDataToDocument(filter ?? {});
    const document = await this.collection.findOne(parsedFilter, options);
    if (document == null) return document;
    const mappedData = this.mapDocumentToData(document);
    return this.parseStringsIDs(mappedData);
  }

  async update(filter: Filter<T>, values: Suggested<T>): Promise<number> {
    const parsedFilter = this.mapDataToDocument(filter ?? {});
    const { modifiedCount } = await this.collection.updateMany(
      parsedFilter,
      values
    );
    return modifiedCount;
  }
}
