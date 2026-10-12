import { ComposedContainer } from "../container/types.js";
import { Container } from "../container/Container.js";
import { Factory } from "../provider/types.js";
import { Provider } from "../provider/Provider.js";
import { RegisterObject, UncomposedProvider } from "./types.js";

/**
 * Builds a dependency registry step by step and converts it into a lazily
 * resolved container.
 *
 * Instances are immutable: {@link Composer.register | register()} returns a new
 * `Composer` whose type `T` includes the newly registered entries.
 *
 * @typeParam T The registry shape used to infer the composed container.
 *
 * @example
 * ```ts
 * const container = Composer.create()
 *     .register({ config: () => ({ port: 3000 }) })
 *     .register({
 *         server: { factory: ({ config }) => new Server(config.port), singleton: true }
 *     })
 *     .compose();
 *
 * container.server; // created on first read, then reused
 * ```
 */
export class Composer<T extends RegisterObject<any> = {}>
{
    private _registerObject: T = {} as T;

    /**
     * Creates a composer for the provided dependency registry.
     *
     * Private; use {@link Composer.create} to obtain an instance.
     *
     * @param registerObject Dependency factories and provider configurations.
     */
    private constructor(registerObject: T)
    {
        this._registerObject = registerObject;
    }

    /**
     * Creates an empty composer.
     *
     * @returns A composer with no registered entries.
     */
    public static create(): Composer
    {
        return new Composer({});
    }

    /**
     * Registers dependencies and returns a new composer; the current one is not
     * modified.
     *
     * Each entry is either a factory (transient: runs on every read) or a
     * provider configuration `{ factory, singleton?, hidden? }`. Factories receive
     * the container with every entry registered so far (including this call's
     * predecessors), fully typed.
     *
     * @remarks
     * - Registering an existing key replaces it; the last registration wins.
     * - Entries are not validated here. Invalid ones fail in {@link Composer.compose}.
     *
     * @typeParam R The entries being registered, inferred as literal types.
     * @param registration Object mapping keys to factories or provider configurations.
     * @returns A new composer whose registry is the previous one extended with `registration`.
     */
    public register<const R extends Record<string, Factory<T, any> | {
            factory: Factory<T, any>;
            singleton?: boolean;
            hidden?: boolean;
        }>>(registration: R): Composer<T & R>
    {
        const registerObject = {
            ...this._registerObject,
            ...registration
        } as T & R;

        return new Composer(registerObject);
    }

    /**
     * Registers all dependencies from another composer and returns a new
     * composer; neither composer is modified.
     *
     * The module's keys and provider types are preserved in the returned
     * composer. If both composers contain the same key, the module's
     * registration replaces the existing registration at runtime.
     *
     * @typeParam U The registry shape of the composer being registered.
     * @param composer Composer containing the registrations to merge.
     * @returns A new composer whose registry contains this composer and the
     * module's registrations.
     */
    public registerModule<const U extends RegisterObject>(
        composer: Composer<U>
    ): Composer<T & U>
    {
        const registration = composer._registerObject;

        const registerObject = {
            ...this._registerObject,
            ...registration
        } as T & U;

        return new Composer(registerObject);        
    }

    /**
     * Composes the registry into a container.
     *
     * Providers are resolved lazily when their corresponding container
     * properties are accessed. The returned type exposes resolved values and
     * omits providers configured with `hidden: true`.
     *
     * @returns A container whose properties are resolved dependency values.
     * @throws {TypeError} If an entry is neither a factory function nor an
     * object with a `factory` property. Factories themselves are not invoked here.
     */
    public compose(): ComposedContainer<T>
    {
        const providers: UncomposedProvider<T>[] = [];

        for(const key in this._registerObject){
            let factory: Factory<T, unknown>;
            let isSingleton = false;
            let isHidden = false;

            if(typeof this._registerObject[key] === 'object' && 'factory' in this._registerObject[key]){
                factory = this._registerObject[key].factory;

                if(this._registerObject[key].singleton) isSingleton = true;
                if(this._registerObject[key].hidden) isHidden = true;
            } else if (typeof this._registerObject[key] === 'function'){
                factory = this._registerObject[key];
            } else {
                throw new TypeError(`Invalid registration entry for key "${key}". Expected a factory function or a provider configuration object.`);
            }

            const provider = new Provider<T, ReturnType<typeof factory>>(
                factory,
                isSingleton,
                isHidden
            );
            providers.push({ key: key, provider: provider });
        }

        return new Container(providers) as ComposedContainer<T>;
    }
}