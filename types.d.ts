export interface RepoInfo {
    stable?: boolean;
    name?: ioBroker.Translated;
    repoTime: string;
    recommendedVersions?: {
        nodeJsAccepted: number[];
        nodeJsRecommended: number;
        npmRecommended: number;
    };
}

export interface RepoAdapterObject extends ioBroker.AdapterCommon {
    weekDownloads?: number;
    published?: string;
    versionDate: string;

    /*controller?: boolean;
    stat?: number;
    node?: string;
    allowAdapterInstall?: boolean;
    allowAdapterUpdate?: boolean;
    allowAdapterDelete?: boolean;
    allowAdapterReadme?: boolean;
    allowAdapterRating?: boolean;
    stable?: string;
    latestVersion?: string;*/
}

export interface NpmVersion {
    name: string;
    version: string;
    keywords?: string[];
    _id: string;
    maintainers: any;
    homepage: string;
    bugs: any;
    dist: {
        shasum: string;
        tarball: string;
        integrity: string;
        signatures: {
            sig: string;
            keyid: string;
        }[];
    };
    _from: string;
    _shasum: string;
    gitHead: string;
    scripts: Record<string, string>;
    _npmUser: {
        name: string;
        email: string;
    };
    licenses: {
        url: string;
        type: string;
    }[];
    repository: {
        url: string;
        type: string;
    };
    _npmVersion: string;
    description: string;
    directories: Record<string, string>;
    contributors: {
        name: string;
        email: string;
    }[];
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
}

export interface NpmInfo {
    _id: string;
    _rev: string;
    name: string;
    'dist-tags': {
        stable?: string;
        latest?: string;
    };
    versions: Record<string, NpmVersion>;
    time: { [version: string]: string };
    bugs: {
        url: string;
    };
    author: string;
    license: string;
    homepage: string;
    keywords: string[];
    repository: {
        type: string;
        url: string;
    };
    description: string;
    contributors: string[];
    maintainers: {
        name: string;
        email: string;
    }[];
    readme: string;
    readmeFilename: string;
    users: Record<string, boolean>;
}

export interface IoBrokerStatistics {
    total: number;
    adapters: { [adapterName: string]: number };
    multihosts: number;
    platforms: {
        linux: number;
        win32: number;
        darwin: number;
        freebsd: number;
        android: number;
        openbsd: number;
    };
    languages: {
        de: number;
        en: number;
        nl: number;
        none: number;
        ru: number;
        pl: number;
        it: number;
        fr: number;
        pt: number;
        zhcn: number;
        es: number;
        uk: number;
    };
    versions: { [adapterName: string]: { [version: string]: number } };
    countries: { [country: string]: number };
    counts: { [date: string]: number };
    nodes: { [nodeVersion: string]: number };
    date: string;
    docker: {
        normal: number;
        docker: number;
    };
    dbTypeStates: {
        redis: number;
        file: number;
        jsonl: number;
        other: number;
    };
    dbTypeObjects: {
        redis: number;
        file: number;
        jsonl: number;
        other: number;
    };
}

export interface Config {
    aws_region: string;
    aws_accessKeyId: string;
    aws_secretAccessKey: string;
    usageStatisticsURL: string;
    generateMapURL: string;
    forumStatisticsURL: string;
    sftpConfig_host: string;
    sftpConfig_port: number;
    sftpConfig_username: string;
    sftpConfig_password: string;
    email: string;
    sourceEmail: string;
    replyEmail: string;
}
