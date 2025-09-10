# remove Maven's build outputs and cached resolution
rm -rf target
rm -rf ~/.m2/repository/

# clean + resolve dependencies fresh
mvn clean

# update to latest *minor* versions allowed by your pom
mvn versions:use-latest-versions -DprocessPlugins=true -DprocessDependencies=false -DprocessParent=false -DallowMajorUpdates=true -DgenerateBackupPoms=false
mvn versions:use-latest-versions -DprocessPlugins=false -DprocessDependencies=true -DprocessParent=false -DallowMajorUpdates=true -DgenerateBackupPoms=false
mvn versions:use-latest-versions -DprocessPlugins=false -DprocessDependencies=false -DprocessParent=true -DallowMajorUpdates=true -DgenerateBackupPoms=false

# update transitive dependencies
mvn versions:use-latest-releases -DgenerateBackupPoms=false

# install dependencies freshly
mvn dependency:resolve

# build the project
mvn install

# "npm link" equivalent = install to local repo so other projects can depend on it
mvn install
