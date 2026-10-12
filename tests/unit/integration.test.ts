import { test, suite } from "node:test";
import assert from "node:assert/strict";

// @ts-ignore -- test tsconfig rootDir is restricted to /tests
import { Composer } from './../../src/packages/core/composer/Composer.js';

class Logger {
    public log(message: string): string { return `[log] ${message}` }
}

class DB {
    constructor(private host: string, private port: number){}
    public getHost(): string { return this.host }
}

class Repository {
    constructor(private db: DB, private logger: Logger){}
    public getDbHost(): string { return this.db.getHost() }
    public getLogger(): Logger { return this.logger }
}

class Service {
    constructor(private repository: Repository, private logger: Logger){}
    public describe(): string { return this.logger.log(`host=${this.repository.getDbHost()}`) }
    public getLogger(): Logger { return this.logger }
}

suite('Integration graph', () => {
    
    test('Resolve a realistic graph containing direct factories and configured providers.', () => {
        const container = Composer.create()
            .register({ config: { factory: () => ({ host: 'localhost', port: 1234 }), hidden: true } })
            .register({ logger: { factory: () => new Logger(), singleton: true } })
            .register({ db: ({ config }) => new DB(config.host, config.port) })
            .register({ repository: ({ db, logger }) => new Repository(db, logger) })
            .register({ service: ({ repository, logger }) => new Service(repository, logger) })
            .compose();

        assert.strictEqual(container.service.describe(), '[log] host=localhost');
    });

    test('Mix singleton and transient services.', (t) => {
        const configFactory = t.mock.fn(() => ({ host: 'localhost', port: 1234 }));
        const dbFactory = t.mock.fn(({ config }: any) => new DB(config.host, config.port));

        const container = Composer.create()
            .register({ config: { factory: configFactory, singleton: true } })
            .register({ db: dbFactory })
            .compose();

        container.db;
        container.db;

        assert.strictEqual(configFactory.mock.calls.length, 1);
        assert.strictEqual(dbFactory.mock.calls.length, 2);
    });

    test('Share a singleton across multiple dependent services.', () => {
        const capturedLoggers: Logger[] = [];

        const container = Composer.create()
            .register({ logger: { factory: () => new Logger(), singleton: true } })
            .register({ db: () => new DB('localhost', 1234) })
            .register({
                repository: ({ db, logger }) => {
                    capturedLoggers.push(logger);
                    return new Repository(db, logger);
                }
            })
            .register({
                service: ({ repository, logger }) => {
                    capturedLoggers.push(logger);
                    return new Service(repository, logger);
                }
            })
            .compose();

        const service = container.service;

        assert.strictEqual(capturedLoggers.length, 2);
        assert.strictEqual(capturedLoggers[0], capturedLoggers[1]);
        assert.strictEqual(capturedLoggers[0], container.logger);
    });

    test('Include hidden infrastructure dependencies used by public services.', () => {
        const container = Composer.create()
            .register({ config: { factory: () => ({ host: 'localhost', port: 1234 }), hidden: true } })
            .register({ db: ({ config }) => new DB(config.host, config.port) })
            .compose();

        assert(container.db instanceof DB && container.db.getHost() === 'localhost');
        assert.strictEqual(container.db.getHost(), 'localhost');

        // @ts-expect-error -- `config` is hidden from the composed container's public type
        assert.deepStrictEqual(container.config, { host: 'localhost', port: 1234 });
    });

    test('Verify the complete graph remains lazy until a public value is read.', (t) => {
        const configFactory = t.mock.fn(() => ({ host: 'localhost', port: 1234 }));
        const dbFactory = t.mock.fn(({ config }) => new DB(config.host, config.port));
        const repositoryFactory = t.mock.fn(({ db }) => new Repository(db, new Logger()));

        const container = Composer.create()
            .register({ config: { factory: configFactory, hidden: true } })
            .register({ db: dbFactory })
            .register({ repository: repositoryFactory })
            .compose();

        assert.strictEqual(configFactory.mock.calls.length, 0);
        assert.strictEqual(dbFactory.mock.calls.length, 0);
        assert.strictEqual(repositoryFactory.mock.calls.length, 0);

        container.repository;

        assert.strictEqual(configFactory.mock.calls.length, 1);
        assert.strictEqual(dbFactory.mock.calls.length, 1);
        assert.strictEqual(repositoryFactory.mock.calls.length, 1);
    });

    test('Current behavior: factory exceptions propagate unmodified, with no path enrichment.', () => {
        const container = Composer.create()
            .register({ db: () => { throw new Error('DB connection failed'); } })
            .register({ repository: ({ db }: any) => new Repository(db, new Logger()) })
            .compose();

        // The current implementation does not enrich errors with the failing
        // registry key/path; the original error propagates unchanged.
        assert.throws(() => container.repository, /DB connection failed/);
    });

    test('Compose centrally from project modules registered through registerModule.', (t) => {
        const infraConfigFactory = t.mock.fn(() => ({ host: 'localhost', port: 1234 }));
        const loggerFactory = t.mock.fn(() => new Logger());
        const dbFactory = t.mock.fn(({ config }) => new DB(config.host, config.port));
        const repositoryFactory = t.mock.fn(({ db, logger }) => new Repository(db, logger));
        const serviceFactory = t.mock.fn(({ repository, logger }) => new Service(repository, logger));

        const infraModule = Composer.create()
            .register({ config: { factory: infraConfigFactory, hidden: true } })
            .register({ logger: { factory: loggerFactory, singleton: true } });

        const persistenceModule = Composer.create()
            .register({ db: dbFactory })
            .register({ repository: repositoryFactory });

        const serviceModule = Composer.create()
            .register({ service: serviceFactory });

        const container = Composer.create()
            .registerModule(infraModule)
            .registerModule(persistenceModule)
            .registerModule(serviceModule)
            .compose();

        assert.strictEqual(infraConfigFactory.mock.calls.length, 0);
        assert.strictEqual(loggerFactory.mock.calls.length, 0);
        assert.strictEqual(dbFactory.mock.calls.length, 0);
        assert.strictEqual(repositoryFactory.mock.calls.length, 0);
        assert.strictEqual(serviceFactory.mock.calls.length, 0);

        assert.strictEqual(container.service.describe(), '[log] host=localhost');

        assert.strictEqual(infraConfigFactory.mock.calls.length, 1);
        assert.strictEqual(loggerFactory.mock.calls.length, 1);
        assert.strictEqual(dbFactory.mock.calls.length, 1);
        assert.strictEqual(repositoryFactory.mock.calls.length, 1);
        assert.strictEqual(serviceFactory.mock.calls.length, 1);
    });
});
