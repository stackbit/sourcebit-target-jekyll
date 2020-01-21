const slugify = require("@sindresorhus/slugify");

// Find a value for each of the model's fields, to show as examples in the
// various questions.
function getExampleFieldValues(model, objects) {
  return objects.reduce((result, object) => {
    const { __metadata: meta, ...fields } = object;
    const isRightModel =
      meta &&
      meta.modelName === model.modelName &&
      meta.projectId === model.projectId &&
      meta.projectEnvironment === model.projectEnvironment &&
      meta.source === model.source;

    if (!isRightModel) return result;

    model.fieldNames
      .filter(fieldName => result[fieldName] === undefined)
      .forEach(fieldName => {
        if (
          !["boolean", "number", "string"].includes(typeof fields[fieldName])
        ) {
          return;
        }

        const stringValue = fields[fieldName].toString().trim();

        if (stringValue.length > 0) {
          result[fieldName] = stringValue;
        }
      });

    return result;
  }, {});
}

module.exports.getSetupForData = async ({
  chalk,
  data,
  inquirer,
  model,
  setupData
}) => {
  // Let's try to find a value for each of the model's fields, to show as
  // examples in the upcoming questions.
  const exampleFieldValues = getExampleFieldValues(model, data.objects);
  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "format",
      message:
        "Choose a format for the file where the data objects will be stored:",
      choices: [
        {
          name: "JSON",
          value: "json"
        },
        {
          name: "YAML",
          value: "yml"
        }
      ]
    },
    {
      type: "list",
      name: "location",
      message: "Choose a location for the file:",
      choices: ({ format }) => [
        {
          name: `_data/${model.modelName}.${format}`,
          value: {
            fileName: `_data/${model.modelName}.${format}`
          }
        },
        {
          name: "It comes from one of the model fields",
          value: {
            fileNameField: true
          }
        },
        {
          name: "Other",
          value: null
        }
      ]
    },
    {
      when: ({ location }) => location && location.fileNameField,
      type: "list",
      name: "location",
      message: "Please select the field that contains the file location",
      choices: model.fieldNames.map(fieldName => {
        const example = exampleFieldValues[fieldName]
          ? ` (e.g. ${exampleFieldValues[fieldName]})`
          : "";

        return {
          name: fieldName + example,
          short: fieldName,
          value: fieldName
        };
      }),
      filter: value => ({ fileNameField: value })
    },
    {
      when: ({ location }) => location === null,
      type: "input",
      name: "location",
      message: "Please insert the location for the file",
      default: ({ format }) => `_data/${model.modelName}.${format}`,
      filter: value => ({ fileName: value })
    },
    {
      type: "confirm",
      name: "isMultiple",
      message: `Do you want to include multiple entries in the same file? ${chalk.reset(
        `If so, multiple entries of ${model.modelName} will be added as an array to the file; if not, only one entry will be kept.`
      )}`,
      default: true
    }
  ]);

  answers.__model = model;

  return {
    ...setupData,
    data: setupData.data.concat(answers)
  };
};

module.exports.getSetupForPage = async ({
  chalk,
  data,
  inquirer,
  model,
  setupData
}) => {
  const answers = {
    __model: model
  };

  // Let's try to find a value for each of the model's fields, to show as
  // examples in the upcoming questions.
  const exampleFieldValues = getExampleFieldValues(model, data.objects);

  const { pageType } = await inquirer.prompt([
    {
      type: "list",
      name: "pageType",
      message: "What is the type of this page?",
      choices: [
        {
          name: "Single page",
          value: "single"
        },
        { name: "Collection of entries", value: "collection" }
      ]
    }
  ]);

  answers.pageType = pageType;

  if (pageType === "single") {
    const { locationSingle } = await inquirer.prompt([
      {
        type: "input",
        name: "locationSingle",
        message: "Choose a location for this page",
        default: `${model.modelName}.md`
      }
    ]);

    answers.location = { fileName: locationSingle };
  } else {
    const { directory, fileNameField, useDate } = await inquirer.prompt([
      {
        type: "list",
        name: "directory",
        message: "Choose the directory for this collection:",
        default: "_posts",
        choices: [
          "_posts",
          model.modelName !== "posts" && `_${model.modelName}`,
          { name: "Other", value: null }
        ].filter(Boolean)
      },
      {
        type: "input",
        name: "directory",
        when: ({ directory }) => directory === null,
        message: "Type the name of the collection."
      },
      {
        type: "confirm",
        name: "useDate",
        message: ({ directory }) =>
          `Do you want to use the post date in the file name? ${chalk.reset(
            `(e.g. '${directory}/2018-03-56-my-blog-post.md')`
          )}`,
        default: true
      },
      {
        type: "list",
        name: "fileNameField",
        message: "Choose a field to generate the file name from:",
        choices: model.fieldNames.map(fieldName => {
          const example = exampleFieldValues[fieldName]
            ? ` (e.g. ${slugify(exampleFieldValues[fieldName]).substring(
                0,
                60
              )})`
            : "";

          return {
            name: fieldName + example,
            short: fieldName,
            value: fieldName
          };
        })
      }
    ]);

    answers.location = {
      directory,
      fileNameField,
      useDate
    };
  }

  const { contentField, layout, layoutSource } = await inquirer.prompt([
    {
      type: "list",
      name: "layoutSource",
      message: "What is the name of the template (i.e. layout) for this page?",
      choices: [
        { name: "It comes from one of the page fields", value: "field" },
        {
          name: "It's a static value that I will specify",
          value: "static"
        },
        { name: "None. I'll add a layout later", value: null }
      ]
    },
    {
      when: ({ layoutSource }) => layoutSource === "field",
      type: "list",
      name: "layout",
      message: "Please select the layout field:",
      choices: model.fieldNames.map(fieldName => {
        const example = exampleFieldValues[fieldName]
          ? ` (e.g. ${exampleFieldValues[fieldName]})`
          : "";

        return {
          name: fieldName + example,
          short: fieldName,
          value: fieldName
        };
      })
    },
    {
      when: ({ layoutSource }) => layoutSource === "static",
      type: "input",
      name: "layout",
      message: "Please insert the layout name"
    },
    {
      type: "list",
      name: "contentField",
      message: `Please select the field that contains the page's content. ${chalk.reset(
        "The other fields will be added to the frontmatter."
      )}`,
      choices: model.fieldNames
        .map(fieldName => {
          const example = exampleFieldValues[fieldName]
            ? ` (e.g. ${exampleFieldValues[fieldName]})`
            : "";

          return {
            name: fieldName + example,
            short: fieldName,
            value: fieldName
          };
        })
        .concat([new inquirer.Separator(), { name: "None", value: null }])
    }
  ]);

  answers.contentField = contentField;
  answers.layout = layout;
  answers.layoutSource = layoutSource;

  return {
    ...setupData,
    pages: setupData.pages.concat(answers)
  };
};
