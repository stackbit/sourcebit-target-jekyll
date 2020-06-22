const inquirerTablePrompt = require('inquirer-table-prompt');
const pkg = require('./package.json');
const slugify = require('@sindresorhus/slugify');
const { getSetupForData, getSetupForPage } = require('./lib/setup');

module.exports.name = pkg.name;

module.exports.transform = ({ data, debug, log, options }) => {
    if (typeof options.writeFile !== 'function') {
        return data;
    }

    const utils = {
        slugify: input => {
            if (typeof input !== 'string' || input.trim().length === 0) {
                throw new Error('ERROR_FAILED_SLUGIFY');
            }

            return slugify(input);
        }
    };
    const files = data.objects.reduce((result, object) => {
        try {
            const writer = options.writeFile(object, utils);

            if (!writer) return result;

            return result.concat(writer);
        } catch (error) {
            const objectDetails = object && object.__metadata && object.__metadata.id ? ` (Object ID: ${object.__metadata.id})` : '';

            if (error.message === 'ERROR_FAILED_SLUGIFY') {
                log(`Could not write object to disk because \`slugify()\` was used on an empty field.${objectDetails}`, 'fail');

                debug(error);
            } else {
                log(`Could not write object to disk.${objectDetails} `, 'fail');

                debug(error);
            }

            return result;
        }
    }, []);

    return {
        ...data,
        files: (data.files || []).concat(files)
    };
};

module.exports.getOptionsFromSetup = ({ answers, debug }) => {
    const { data: dataObjects = [], pages = [] } = answers;
    const conditions = [];

    pages.forEach(page => {
        const { modelName, projectId, source } = page.__model;

        let location = '';

        if (page.location.fileName) {
            location = `'${page.location.fileName}'`;
        } else {
            const { directory, fileNameField, useDate } = page.location;
            const locationParts = [];

            if (directory) {
                locationParts.push(`'${directory}/'`);
            }

            if (useDate) {
                locationParts.push(`createdAt.substring(0, 10) + '-'`);
            }

            locationParts.push(`utils.slugify(fields['${fileNameField}']) + '.md'`);
            location = locationParts.join(' + ');
        }

        const contentField = page.contentField ? `fields['${page.contentField}']` : '{}';
        const layout = page.layoutSource === 'static' ? `'${page.layout}'` : `fields['${page.layout}']`;
        const extractedProperties = [
            '__metadata',
            page.contentField ? `'${page.contentField}': content` : null,
            page.layoutSource ? 'layout' : null,
            '...frontmatterFields'
        ];
        const conditionParts = [
            modelName && `modelName === '${modelName}'`,
            projectId && `projectId === '${projectId}'`,
            source && `source === '${source}'`
        ].filter(Boolean);

        conditions.push(
            `if (${conditionParts.join(' && ')}) {`,
            `  const { ${extractedProperties.filter(Boolean).join(', ')} } = entry;`,
            ``,
            `  return {`,
            `    content: {`,
            `      body: ${contentField},`,
            `      frontmatter: ${page.layoutSource ? `{ ...frontmatterFields, layout: ${layout} }` : 'frontmatterFields'},`,
            `    },`,
            `    format: 'frontmatter-md',`,
            `    path: ${location}`,
            `  };`,
            `}\n`
        );
    });

    dataObjects.forEach(dataObject => {
        const { modelName, projectId, source } = dataObject.__model;
        const { format, isMultiple } = dataObject;
        const location = dataObject.location.fileName
            ? `'${dataObject.location.fileName}'`
            : `fields['${dataObject.location.fileNameField}']`;

        conditions.push(
            `if (modelName === '${modelName}' && projectId === '${projectId}' && source === '${source}') {`,
            `  const { __metadata, ...fields } = entry;`,
            ``,
            `  return {`,
            `    append: ${isMultiple},`,
            `    content: fields,`,
            `    format: '${format}',`,
            `    path: ${location}`,
            `  };`,
            `}\n`
        );
    });

    const functionBody = `
// This function is invoked for each entry and its return value determines
// whether the entry will be written to a file. When an object with \`content\`,
// \`format\` and \`path\` properties is returned, a file will be written with
// those parameters. If a falsy value is returned, no file will be created.
const { __metadata: meta, ...fields } = entry;

if (!meta) return;

const { createdAt = '', modelName, projectId, source } = meta;

${conditions.join('\n')}
  `.trim();

    debug('Function body: %s', functionBody);

    return {
        writeFile: new Function('entry', 'utils', functionBody)
    };
};

module.exports.getSetup = ({ chalk, data, inquirer }) => {
    inquirer.registerPrompt('table', inquirerTablePrompt);

    return async () => {
        const { models: modelTypes } = await inquirer.prompt([
            {
                type: 'table',
                name: 'models',
                message: 'Choose a type for each of the following models:',
                pageSize: 7,
                rows: data.models.map((model, index) => ({
                    name: `${model.modelLabel || model.modelName}\n${chalk.dim(`└${model.source}`)}`,
                    value: index
                })),
                columns: [
                    {
                        name: 'Page',
                        value: 'page'
                    },
                    {
                        name: 'Data',
                        value: 'data'
                    },
                    {
                        name: 'Skip',
                        value: undefined
                    }
                ]
            }
        ]);
        const dataModels = [];
        const pageModels = [];

        modelTypes.forEach((type, index) => {
            if (type === 'data') {
                dataModels.push(data.models[index]);
            } else if (type === 'page') {
                pageModels.push(data.models[index]);
            }
        });

        let queue = Promise.resolve({ data: [], pages: [] });

        pageModels.forEach((model, index) => {
            queue = queue.then(async setupData => {
                console.log(
                    `\nConfiguring page: ${chalk.bold(model.modelLabel || model.modelName)} ${chalk.reset.italic.green(
                        `(${index + 1} of ${pageModels.length}`
                    )})`
                );

                return getSetupForPage({ chalk, data, inquirer, model, setupData });
            });
        });

        dataModels.forEach((model, index) => {
            queue = queue.then(async setupData => {
                console.log(
                    `\nConfiguring data object: ${chalk.bold(model.modelLabel || model.modelName)} ${chalk.reset.italic.green(
                        `(${index + 1} of ${dataModels.length}`
                    )})`
                );

                return getSetupForData({ chalk, data, inquirer, model, setupData });
            });
        });

        return queue;
    };
};
