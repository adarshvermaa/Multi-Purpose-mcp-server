import { Application } from "express";
import fs from "fs/promises";
import path from "path";
import { convertToKebabCase } from "./caseConverter";

function cleanFileName(fileName: string): string {
  // Remove any unnecessary characters or patterns
  // Example: Remove digits, special characters, or specific words
  const cleanedFileName = fileName
    .replace(/\d+/g, "") // Remove digits
    .replace(/[^\w\s]/g, "") // Remove special characters
    .replace(/And/g, "-") // Replace 'And' with '-'
    .replace(/Or/g, "-") // Replace 'Or' with '-'
    .replace(/\s+/g, ""); // Remove extra spaces

  // Convert to kebab case
  return convertToKebabCase(cleanedFileName);
}

export async function loadRoutes(app: Application) {
  try {
    // get features directory path
    const featuresPath = path.join(__dirname, "../main");
    console.log(featuresPath);

    // get all feature(ex. user, vehicle etc.) folders from features directory path
    const features = await fs.readdir(featuresPath);

    // iterate all the feature from features
    for (const feature of features) {
      // get every feature routes directory path
      const featureRoutes = path.join(featuresPath, feature, "routes");
      let isFeatureRoutesExits = false;

      try {
        // check routes folder is exits or not inside feature/{feature_name}
        await fs.access(featureRoutes);
        isFeatureRoutesExits = true;
      } catch {
        isFeatureRoutesExits = false;
      }

      if (!isFeatureRoutesExits) {
        // skip current iteration if path is not exists
        continue;
      }
      // get versions from feature routes directory
      const featureRoutesVersions = await fs.readdir(featureRoutes);

      // iterate version from every feature routes
      for (const version of featureRoutesVersions) {
        // get every features routes with their versions
        const featureVersionRoutes = path.join(featureRoutes, version);

        // get all routes files from every features version routes
        const featureVersionRouteFiles = await fs.readdir(featureVersionRoutes);

        // iterate every route files of feature version routes
        for (const routeFile of featureVersionRouteFiles) {
          // skip the files which includes .d.ts extension inside build(dist)
          if (routeFile.includes(".d.ts")) {
            continue;
          }
          try {
            // require every route path
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const route = require(path.join(
              featureVersionRoutes,
              routeFile
            )).default;

            if (route) {
              /**
               * clean feature name
               * example: users, expensesAndInvestmentsCalculations will be changed to users, expenses-investments-calculations
               */
              const cleanedFeature = cleanFileName(feature);

              // add api prefix with feature name
              let apiEndpoint = `/api/${version}/${cleanedFeature}`;

              /**
               *  Below commented code is used to update the api endpoint if the route file name inside feature's routes folder is different from the feature name
               * For now every routes inside feature's routes folder will be prefixed with feature name only.
               * So, if the route file name is different from the feature name, the api endpoint will be updated.
               * it could be updated later if needed by the developer's preference. before going to production.
               * It is useful for avoding api endpoint collision.
               */
              if (routeFile.split(".")[0] !== feature) {
                // update the api prefix if the route file name inside feature's routes folder is different from the feature name
                const cleanedFileName = cleanFileName(routeFile.split(".")[0]);
                apiEndpoint = `/api/${version}/${cleanedFeature}/${cleanedFileName}`;
              }

              // console.log(`Loading route: ${apiEndpoint}`);
              /**
               * add route to express app
               * example: app.use('/api/v1/users', routes)
               */
              console.log(`route: ${apiEndpoint}`);
              app.use(apiEndpoint, route);
            }
          } catch (routeError) {
            console.error(
              `Failed to load route file ${routeFile}:`,
              routeError
            );
          }
        }
      }
    }
  } catch (err) {
    console.error("Error loading routes:", err);
  }
}
