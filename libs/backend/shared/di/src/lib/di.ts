export type ResolveType<I> = I extends Token<infer T>
  ? T
  : I extends Class<infer T>
  ? T
  : I extends (...args: any[]) => infer R
  ? R
  : I;

export type Class<T = any> = new (...args: any[]) => T;

export class Token<T> {
  id: symbol;

  type?: T;

  constructor(description: string) {
    this.id = Symbol(description);
  }

  toString() {
    return `Token[${this.id.description}]`;
  }
}

export function createToken<T>(description: string) {
  return new Token<T>(description);
}

export type Injectable<T> = Token<T> | Class<T>;

export type Provider<T> = {
  provide: T;
};

export type FactoryProvider<T> = Provider<T> & {
  useFactory: () => T;
};

export type ValueProvider<T> = Provider<T> & {
  useValue: T;
};

export type ClassProvider<T> = Provider<T> & {
  useClass: Class<T>;
};

export function isProvider<T>(
  possiblyProvider: any | Provider<T>
): possiblyProvider is Provider<T> {
  return 'provide' in possiblyProvider;
}

export function isFactoryProvider<T extends Injectable<any>>(
  possiblyProvider: Providable<T>
): possiblyProvider is FactoryProvider<T> {
  return 'useFactory' in possiblyProvider;
}

export function isValueProvider<T extends Injectable<any>>(
  possiblyProvider: Providable<T>
): possiblyProvider is ValueProvider<T> {
  return 'useValue' in possiblyProvider;
}

export function isClassProvider<T extends Injectable<any>>(
  possiblyProvider: Providable<T>
): possiblyProvider is ClassProvider<T> {
  return 'useClass' in possiblyProvider;
}

function isToken<T>(possiblyToken: any | Token<T>): possiblyToken is Token<T> {
  return (
    typeof possiblyToken === 'object' && typeof possiblyToken.id === 'symbol'
  );
}

function isClass(possiblyClass: any): possiblyClass is Class<any> {
  return (
    typeof possiblyClass === 'function' &&
    possiblyClass.prototype?.constructor === possiblyClass
  );
}

export type Providable<T extends Injectable<any>> =
  | Provider<T>
  | FactoryProvider<T>
  | ValueProvider<T>
  | ClassProvider<T>;

export class Injector {
  private _records = new Map<Injectable<any>, any>();

  private _providers = new Map<Injectable<any>, Provider<any>>();

  constructor(public description?: string) {}

  provide<T extends Injectable<any>>(provider: Providable<T>) {
    if (isProvider(provider)) {
      this._providers.set(provider.provide, provider);
    }
  }

  inject<T>(injectable: Injectable<T>): T {
    if (this._records.has(injectable)) {
      return this._records.get(injectable);
    }

    const instance = this._resolveInstance(injectable);

    this._records.set(injectable, instance);

    return instance;
  }

  toString() {
    return `Injector[${this.description}]`;
  }

  private _resolveInstance<T>(injectable: Injectable<T>): T {
    const provider = this._providers.get(injectable);

    if (provider) {
      if (isFactoryProvider(provider)) {
        return provider.useFactory();
      }

      if (isValueProvider(provider)) {
        return provider.useValue;
      }

      if (isClassProvider(provider)) {
        return new provider.useClass();
      }

      throw new Error(`Unknown provider. Cannot instantiate [${injectable}]`);
    }

    if (isToken(injectable)) {
      throw new Error(
        `No provider for token: ${String(injectable.id.description)}`
      );
    }

    if (isClass(injectable)) {
      return new injectable();
    }

    throw new Error(`Cannot instantiate [${injectable}]`);
  }
}

export function createInjector(context: string) {
  return new Injector(context);
}
