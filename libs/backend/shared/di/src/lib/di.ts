import 'reflect-metadata';

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
  provide: Injectable<T>;
};

export type FactoryProvider<T> = Provider<T> & {
  useFactory: (...args: ReadonlyArray<any>) => T;
  deps?: ReadonlyArray<any>;
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
  return (
    typeof possiblyProvider === 'object' &&
    possiblyProvider !== null &&
    'provide' in possiblyProvider
  );
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
    typeof possiblyToken === 'object' &&
    possiblyToken !== null &&
    typeof (possiblyToken as Token<T>).id === 'symbol'
  );
}

function isClass(possiblyClass: any): possiblyClass is Class<any> {
  return (
    typeof possiblyClass === 'function' &&
    possiblyClass.prototype &&
    possiblyClass.prototype.constructor === possiblyClass
  );
}

export type Providable<T> =
  | ValueProvider<T>
  | ClassProvider<T>
  | FactoryProvider<T>;

export type Provide<T> = Providable<T> | Class<T> | Injectable<T>;

export class Injector {
  private _instances = new Map<Injectable<any>, any>();

  private _providers = new Map<Injectable<any>, Providable<any>>();

  private _resolving = new Set<Injectable<any>>();

  constructor(public description?: string) {}

  provide<T>(provider: FactoryProvider<T>): void;
  provide<T>(provider: ValueProvider<T>): void;
  provide<T>(provider: ClassProvider<T>): void;
  provide<T>(targetClass: Class<T>): void;
  provide<T>(injectable: Injectable<T>, useValue: T): void;
  provide<T>(providable: Provide<T>, value?: T) {
    if (isProvider(providable)) {
      this._providers.set(providable.provide, providable);
    } else if (isClass(providable)) {
      this._providers.set(providable, {
        provide: providable,
        useClass: providable,
      } as ClassProvider<T>);
    } else if (value !== undefined) {
      this._providers.set(providable, {
        provide: providable,
        useValue: value,
      } as ValueProvider<T>);
    } else {
      throw new Error(
        `Invalid provider configuration for: ${String(providable)}`
      );
    }
  }

  inject<T>(injectable: Injectable<T>): T {
    const immediatelyResolvedInstance = this._instances.get(injectable);
    if (immediatelyResolvedInstance) {
      return immediatelyResolvedInstance;
    }

    if (this._resolving.has(injectable)) {
      throw new Error(
        `Circular dependency detected while resolving: ${
          this._resolving.values().next().value
        } -> ${String(injectable)}`
      );
    }

    this._resolving.add(injectable);

    let instance: T;

    try {
      instance = this._resolveInstance(injectable);
      this._instances.set(injectable, instance);
    } finally {
      this._resolving.delete(injectable);
    }

    return instance;
  }

  toString() {
    return `Injector[${this.description || 'anonymous'}]`;
  }

  private _resolveInstance<T>(injectable: Injectable<T>): T {
    const provider = this._providers.get(injectable);

    if (provider) {
      if (isFactoryProvider(provider)) {
        const deps = provider?.deps ?? [];
        const resolvedDeps = deps.map((dep) => this.inject(dep));

        return provider.useFactory(...resolvedDeps);
      }

      if (isValueProvider(provider)) {
        return provider.useValue;
      }

      if (isClassProvider(provider)) {
        return this._instantiateClass(provider.useClass);
      }

      throw new Error(
        `Unknown provider type for injectable: ${String(injectable)}`
      );
    }

    if (isClass(injectable)) {
      return this._instantiateClass(injectable);
    }

    if (isToken(injectable)) {
      throw new Error(
        `No provider for token: ${String(
          injectable.id.description
        )} in injector: ${this.toString()}`
      );
    }

    throw new Error(
      `Cannot instantiate unknown injectable: ${String(
        injectable
      )} in injector: ${this.toString()}`
    );
  }

  private _instantiateClass<T>(targetClass: Class<T>): T {
    console.log(
      targetClass,
      Reflect.getMetadataKeys(targetClass),
      Reflect.getOwnMetadataKeys(targetClass)
    );
    const paramTypes = getConstructorDeps(targetClass);

    console.log(paramTypes);

    const dependencies = paramTypes.map((paramType) => {
      if (paramType === undefined) {
        throw new Error(
          `Cannot resolve dependency for class ${targetClass.name}. A constructor parameter type is undefined. ` +
            `Ensure all constructor parameters are Injectable types (Classes or Tokens).`
        );
      }
      return this.inject(paramType as Injectable<any>);
    });

    return new targetClass(...dependencies);
  }
}

function getConstructorDeps<T>(target: new (...args: any[]) => T): any[] {
  return Reflect.getMetadata('design:paramtypes', target) || [];
}

export function createInjector(description?: string) {
  return new Injector(description);
}

export function Injectable() {
  return function (...deps: any) {
    console.log('Injectable()', deps);
  };
}
